# HK School Finder Deployment Guide

## Option 1: GitHub Pages (static hosting)

This project is ready for static hosting. On GitHub Pages, the app will prefer `SCH_LOC_EDB.json` first so it can run without `server.js`.

### Steps
1. Create a GitHub repository and push this folder.
2. In the repository, open **Settings -> Pages**.
3. Set **Source** to **GitHub Actions**.
4. Push to the `main` branch. The workflow in `.github/workflows/deploy-pages.yml` will publish the site.

Your URL will look like:

```text
https://YOUR-USERNAME.github.io/YOUR-REPO/
```

## Option 2: Render (Node hosting)

This project is also ready for Render using `render.yaml` and `npm start`.

### Steps
1. Push the project to GitHub.
2. In Render, choose **New + -> Web Service**.
3. Connect your repository.
4. Render will detect `render.yaml` automatically.
5. Deploy.

Render will run:

```bash
npm install
npm start
```

The app will be available at your Render URL and `/api/schools` will continue to work there.

## Local check

```bash
npm start
```

Then open:

```text
http://127.0.0.1:5500/
```
