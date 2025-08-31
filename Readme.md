# Instagram Reel Downloader

A simple web application to download Instagram reels with video preview functionality.

## Features

- 🎥 Video preview before download
- 📱 Mobile-friendly responsive design
- 🚀 Fast and reliable downloads
- 🔍 Video review with thumbnail
- 💾 Direct download links

## Tech Stack

- **Frontend**: HTML, CSS (Tailwind), JavaScript
- **Backend**: Node.js, Express
- **Deployment**: Vercel
- **Dependencies**: axios, instagram-url-direct

## Local Development

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the development server:
   ```bash
   npm start
   ```
4. Open `http://localhost:3002` in your browser

## Vercel Deployment

This app is configured for Vercel deployment with serverless functions.

### Deploy Steps:

1. **Install Vercel CLI** (if not already installed):
   ```bash
   npm i -g vercel
   ```

2. **Login to Vercel**:
   ```bash
   vercel login
   ```

3. **Deploy**:
   ```bash
   vercel
   ```

4. **For production deployment**:
   ```bash
   vercel --prod
   ```

### Project Structure for Vercel:

```
├── api/
│   └── index.js          # Serverless function
├── public/
│   └── index.html        # Frontend
├── vercel.json           # Vercel configuration
└── package.json
```

### Environment Variables

No environment variables required for basic functionality.

## API Endpoints

- `POST /api/review` - Get video information and preview
- `POST /api/download` - Get download link
- `GET /api/preview` - Stream video preview

## Usage

1. Enter Instagram reel URL
2. Click "Review Video" to see preview and details
3. Click "Download Reel" to get download link
4. Click the download button to save the video

## Supported URLs

- Instagram Reels: `https://www.instagram.com/reel/[ID]/`
- Instagram Posts: `https://www.instagram.com/p/[ID]/`
- Instagram TV: `https://www.instagram.com/tv/[ID]/`

## Troubleshooting

### Common Issues:

1. **Video preview not showing**: This is normal due to Instagram's CORS policy. Use "Open Video in New Tab" button.

2. **Download not working**: Make sure the Instagram URL is valid and public.

3. **Vercel deployment fails**: Check that all dependencies are in `package.json` and Node.js version is compatible.

### Vercel-specific Issues:

1. **Function timeout**: Increase timeout in `vercel.json` if needed
2. **CORS errors**: Make sure CORS headers are properly set in API functions
3. **Static files not serving**: Check `vercel.json` routes configuration

## License

MIT License