const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const port = process.env.PORT || 5500;
const root = __dirname;
const bureauDataUrl = 'https://www.edb.gov.hk/attachment/en/student-parents/sch-info/sch-search/sch-location-info/SCH_LOC_EDB.json';
const forumDataFile = path.join(root, 'forum-posts.json');

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json'
};

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
  });
  res.end(JSON.stringify(payload));
}

function sendFile(filePath, res) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(err.code === 'ENOENT' ? 404 : 500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(err.code === 'ENOENT' ? 'Not Found' : 'Server Error');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': mimeTypes[ext] || 'application/octet-stream',
      'Cache-Control': 'no-store'
    });
    res.end(data);
  });
}

function proxySchoolData(res) {
  https.get(bureauDataUrl, upstream => {
    if (upstream.statusCode !== 200) {
      upstream.resume();
      sendFile(path.join(root, 'SCH_LOC_EDB.json'), res);
      return;
    }

    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*'
    });
    upstream.pipe(res);
  }).on('error', () => {
    sendFile(path.join(root, 'SCH_LOC_EDB.json'), res);
  });
}

function ensureForumStore() {
  if (!fs.existsSync(forumDataFile)) {
    const seedPosts = [
      {
        id: 'welcome-parent',
        role: 'parent',
        name: 'Parent guide',
        topic: 'Welcome to the school forum',
        message: 'Ask about school visits, commute, learning support, or application tips here.',
        createdAt: '2026-04-05T09:00:00.000Z',
        replies: []
      },
      {
        id: 'welcome-student',
        role: 'student',
        name: 'Student voice',
        topic: 'What makes a school feel welcoming?',
        message: 'Share what information helped you understand school life and activities.',
        createdAt: '2026-04-05T10:30:00.000Z',
        replies: []
      }
    ];
    fs.writeFileSync(forumDataFile, JSON.stringify(seedPosts, null, 2), 'utf8');
  }
}

function normalizeForumPosts(posts) {
  return (Array.isArray(posts) ? posts : []).map(post => ({
    ...post,
    replies: Array.isArray(post.replies) ? post.replies : []
  }));
}

function readForumPosts() {
  ensureForumStore();
  try {
    const raw = fs.readFileSync(forumDataFile, 'utf8');
    const posts = JSON.parse(raw);
    return normalizeForumPosts(posts);
  } catch {
    return [];
  }
}

function writeForumPosts(posts) {
  fs.writeFileSync(forumDataFile, JSON.stringify(posts.slice(0, 100), null, 2), 'utf8');
}

function sanitizeForumText(value, maxLength) {
  return String(value || '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function readJsonBody(req, callback) {
  let body = '';
  req.on('data', chunk => {
    body += chunk;
    if (body.length > 1_000_000) {
      req.destroy();
    }
  });
  req.on('end', () => {
    if (!body) {
      callback(null, {});
      return;
    }
    try {
      callback(null, JSON.parse(body));
    } catch (error) {
      callback(error);
    }
  });
  req.on('error', callback);
}

http.createServer((req, res) => {
  const reqPath = decodeURIComponent(req.url.split('?')[0]);

  if (req.method === 'OPTIONS' && reqPath.startsWith('/api/')) {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
    });
    res.end();
    return;
  }

  if (reqPath === '/api/schools') {
    proxySchoolData(res);
    return;
  }

  if (reqPath === '/api/forum') {
    if (req.method === 'GET') {
      sendJson(res, 200, { posts: readForumPosts() });
      return;
    }

    if (req.method === 'POST') {
      readJsonBody(req, (error, body = {}) => {
        if (error) {
          sendJson(res, 400, { error: 'Invalid forum request.' });
          return;
        }

        const role = body.role === 'student' ? 'student' : 'parent';
        const name = sanitizeForumText(body.name, 40) || (role === 'student' ? 'Student' : 'Parent');
        const parentId = sanitizeForumText(body.parentId, 80);
        const topic = sanitizeForumText(body.topic, 120);
        const message = sanitizeForumText(body.message, 800);
        const posts = readForumPosts();

        if (parentId) {
          if (!message) {
            sendJson(res, 400, { error: 'Reply message is required.' });
            return;
          }

          const targetPost = posts.find(post => post.id === parentId);
          if (!targetPost) {
            sendJson(res, 404, { error: 'Forum post not found.' });
            return;
          }

          const reply = {
            id: `reply-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            role,
            name,
            message,
            createdAt: new Date().toISOString()
          };

          targetPost.replies = Array.isArray(targetPost.replies) ? targetPost.replies : [];
          targetPost.replies.unshift(reply);
          writeForumPosts(posts);
          sendJson(res, 201, { reply, post: targetPost, posts });
          return;
        }

        if (!topic || !message) {
          sendJson(res, 400, { error: 'Topic and message are required.' });
          return;
        }

        const post = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          role,
          name,
          topic,
          message,
          createdAt: new Date().toISOString(),
          replies: []
        };

        posts.unshift(post);
        writeForumPosts(posts);
        sendJson(res, 201, { post, posts });
      });
      return;
    }

    sendJson(res, 405, { error: 'Method not allowed.' });
    return;
  }

  let filePath = path.join(root, reqPath === '/' ? 'index.html' : reqPath.replace(/^\//, ''));

  if (!filePath.startsWith(root)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Forbidden');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (!err && stats.isDirectory()) {
      filePath = path.join(filePath, 'index.html');
    }
    sendFile(filePath, res);
  });
}).listen(port, () => {
  console.log(`SchoolSpark HK running at http://127.0.0.1:${port}`);
});
