# TuneFuse 

A modern music recommendation platform combining Spotify, Last.fm, and Deezer APIs to help you discover your next favorite song!

##  Quick Start Guide

### Prerequisites

1. Make sure you have these installed:
   - Python 3.8 or higher ([Download Python](https://www.python.org/downloads/))
   - Git ([Download Git](https://git-scm.com/downloads))

2. Get your API Keys:
   - Spotify API: [Get Keys Here](https://developer.spotify.com/dashboard/)
   - Last.fm API: [Get Keys Here](https://www.last.fm/api/account/create)

### Installation Steps

1. **Clone the Repository**
   ```bash
   git clone https://github.com/yourusername/tunefuse.git
   cd tunefuse
   ```

2. **Create and Activate Virtual Environment**
   
   Windows:
   ```bash
   python -m venv venv
   venv\Scripts\activate
   ```
   
   macOS/Linux:
   ```bash
   python -m venv venv
   source venv/bin/activate
   ```

3. **Install Dependencies**
   ```bash
   pip install -r requirements.txt
   ```

4. **Set Up Environment Variables**
   
   Create a file named `.env` in the project root and add your API keys:
   ```env
   SPOTIFY_CLIENT_ID=your_spotify_client_id
   SPOTIFY_CLIENT_SECRET=your_spotify_client_secret
   SPOTIFY_REDIRECT_URI=http://localhost:5000/callback
   LASTFM_API_KEY=your_lastfm_api_key
   ```

5. **Run the Application**
   ```bash
   python server.py
   ```

6. **Access TuneFuse**
   - Open your browser
   - Go to: `http://localhost:5000`
   - Start discovering music! 🎉

##  Features

-  Smart song search with autocomplete
-  Personalized music recommendations
-  Song preview playback
-  Animated starfield background
-  User account system
-  Like/save favorite songs
-  Hide unwanted recommendations
-  Integration with Spotify, Last.fm, and Deezer

## Troubleshooting

### Common Issues & Solutions

1. **"ModuleNotFoundError" when running the application**
   ```bash
   pip install --upgrade -r requirements.txt
   ```

2. **"Port already in use" error**
   - Change the port in `server.py`:
     ```python
     app.run(debug=True, port=5001)  # Change 5001 to any available port
     ```

3. **API Key Issues**
   - Double-check your `.env` file
   - Ensure no extra spaces or quotes in the `.env` file
   - Verify API keys are active in respective dashboards

4. **Database Issues**
   ```bash
   # Remove the existing database
   rm tunefuse.db
   # Restart the application to create a fresh database
   python server.py
   ```

## API Key Setup Guide

### Getting Spotify API Keys
1. Go to [Spotify Developer Dashboard](https://developer.spotify.com/dashboard/)
2. Log in with your Spotify account
3. Click "Create App"
4. Set Redirect URI to: `http://localhost:5000/callback`
5. Save your Client ID and Client Secret

### Getting Last.fm API Key
1. Visit [Last.fm API Account Creation](https://www.last.fm/api/account/create)
2. Fill in the application details
3. Save your API key

## Need Help?

If you encounter any issues:
1. Check the troubleshooting section above
2. Ensure all prerequisites are installed
3. Verify your API keys are correct
4. Create an issue in the GitHub repository with:
   - Your operating system
   - Python version (`python --version`)
   - Full error message
   - Steps to reproduce the issue
