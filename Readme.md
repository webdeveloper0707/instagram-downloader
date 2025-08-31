
# Instagram Reel Downloader

Node.js और Express.js का use करके बनाया गया Instagram Reel Video Downloader।

## Features

- ✅ Instagram Reel URL से direct video download
- ✅ Simple और clean web interface
- ✅ Real-time progress indicator
- ✅ Error handling और user-friendly messages
- ✅ Automatic file cleanup
- ✅ Mobile responsive design

## Installation

1. **Repository clone करें या code download करें**
```bash
git clone <your-repo-url>
cd instagram-reel-downloader
```

2. **Dependencies install करें**
```bash
npm install
```

3. **Server start करें**
```bash
# Development mode (with auto-restart)
npm run dev

# Production mode
npm start
```

4. **Browser में open करें**
```
http://localhost:3000
```

## Usage

1. Web browser में application open करें
2. Instagram reel का URL paste करें
3. "Download Video" button पर click करें
4. Download complete होने का wait करें
5. Download link पर click करके video save करें

## Supported URLs

- Instagram Reels: `https://www.instagram.com/reel/XXXXXXX/`
- Instagram Posts: `https://www.instagram.com/p/XXXXXXX/`
- Instagram TV: `https://www.instagram.com/tv/XXXXXXX/`

## Dependencies

- **express**: Web framework
- **axios**: HTTP client for downloading videos
- **instagram-url-direct**: Instagram URL resolver
- **path & fs**: File system operations

## File Structure

```
├── server.js          # Main Express server
├── package.json       # Dependencies और scripts
├── public/            # Static files (HTML, CSS, JS)
│   ├── index.html    # Frontend interface
│   ├── style.css     # Styling
│   └── app.js        # Frontend JavaScript
└── downloads/         # Downloaded videos (auto-created)
```

## Important Notes

- Downloaded videos automatically delete हो जाती हैं 1 hour बाद
- केवल public Instagram content download कर सकते हैं
- Instagram Terms of Service का respect करें
- Personal use के लिए ही download करें

## Troubleshooting

**Error: "Package not found"**
```bash
npm install instagram-url-direct@latest
```

**Error: "Port already in use"**
```bash
# Different port use करें
PORT=3001 npm start
```

**Download failed errors:**
- URL valid है check करें
- Internet connection check करें
- Private account का URL तो नहीं

## Legal Notice

यह tool केवल educational और personal use के लिए है। Instagram की Terms of Service का follow करें और content creator के rights respect करें।
