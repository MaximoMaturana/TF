import base64
import os
import requests
import logging
from flask import Flask, request, jsonify, render_template, session, redirect, url_for
from dotenv import load_dotenv
from database import Database
from werkzeug.security import generate_password_hash, check_password_hash
import aiohttp
from aiohttp import ClientSession
import asyncio
from functools import wraps

# Load environment variables
load_dotenv()
SPOTIFY_CLIENT_ID = os.getenv("SPOTIFY_CLIENT_ID")
SPOTIFY_CLIENT_SECRET = os.getenv("SPOTIFY_CLIENT_SECRET")
SPOTIFY_REDIRECT_URI = os.getenv("SPOTIFY_REDIRECT_URI")
LASTFM_API_KEY = os.getenv("LASTFM_API_KEY")
DEEZER_API_URL = "https://api.deezer.com/search"

# Initialize Flask app with correct static folder path
app = Flask(__name__, 
    static_folder='assets',    # Changed from 'static' to 'assets'
    static_url_path=''         # Empty string to serve from root
)
app.secret_key = os.urandom(24)

# Initialize database
db = Database()

# Configure logging
logging.basicConfig(level=logging.DEBUG)

def get_spotify_token():
    """Get or refresh Spotify access token."""
    if 'spotify_token' not in session:
        auth_string = f"{SPOTIFY_CLIENT_ID}:{SPOTIFY_CLIENT_SECRET}"
        auth_bytes = auth_string.encode('utf-8')
        auth_base64 = str(base64.b64encode(auth_bytes), 'utf-8')
        
        url = "https://accounts.spotify.com/api/token"
        headers = {
            "Authorization": f"Basic {auth_base64}",
            "Content-Type": "application/x-www-form-urlencoded"
        }
        data = {"grant_type": "client_credentials"}
        
        try:
            result = requests.post(url, headers=headers, data=data)
            json_result = result.json()
            token = json_result.get("access_token")
            session['spotify_token'] = token
            return token
        except Exception as e:
            logging.error(f"Error getting Spotify token: {e}")
            return None
    
    return session['spotify_token']

# ✅ Serve Home Page
@app.route('/')
def home():
    return render_template('index.html')

# ✅ Serve Welcome Page
@app.route('/welcome')
def welcome():
    return render_template('welcome.html')

# ✅ Spotify OAuth Login
@app.route('/link_spotify')
def link_spotify():
    """Redirect user to Spotify OAuth login."""
    auth_url = f"https://accounts.spotify.com/authorize?client_id={SPOTIFY_CLIENT_ID}&response_type=code&redirect_uri={SPOTIFY_REDIRECT_URI}&scope=user-library-read user-library-modify user-read-private user-read-email"
    logging.debug(f"Redirecting to Spotify OAuth URL: {auth_url}")
    return redirect(auth_url)

@app.route('/callback')
def spotify_callback():
    """Handle Spotify OAuth callback."""
    code = request.args.get("code")
    if not code:
        logging.error("Authorization failed: No code provided")
        return jsonify({"error": "Authorization failed"}), 400

    # Exchange code for access token
    token_url = "https://accounts.spotify.com/api/token"
    token_data = {
        "grant_type": "authorization_code",
        "code": code,
        "redirect_uri": SPOTIFY_REDIRECT_URI,
        "client_id": SPOTIFY_CLIENT_ID,
        "client_secret": SPOTIFY_CLIENT_SECRET
    }
    
    response = requests.post(token_url, data=token_data)
    if response.status_code == 200:
        access_token = response.json().get("access_token")
        session["spotify_token"] = access_token

        # Get user info
        user_info_url = "https://api.spotify.com/v1/me"
        user_info_response = requests.get(user_info_url, headers={"Authorization": f"Bearer {access_token}"})
        if user_info_response.status_code == 200:
            user_info = user_info_response.json()
            spotify_id = user_info["id"]
            email = user_info["email"]
            username = user_info["display_name"]

            logging.debug(f"Spotify user info: {user_info}")

            # Check if user already exists
            user = db.get_user_by_spotify_id(spotify_id)
            if not user:
                # Create a new TuneFuse account
                user = db.create_user(username, "spotify", email, spotify_id)
                session["user_id"] = user["id"]
                logging.debug(f"Created new user with ID: {user['id']}")
            else:
                session["user_id"] = user["id"]
                logging.debug(f"Existing user ID: {user['id']}")

            return redirect(url_for('home'))
        else:
            logging.error(f"Failed to get user info from Spotify: {user_info_response.status_code}")
    else:
        logging.error(f"Failed to exchange code for access token: {response.status_code}")

    return jsonify({"error": "Failed to link Spotify"}), 400

@app.route('/api/search')
def search():
    """Handle search with Spotify"""
    query = request.args.get('q')
    if not query:
        return jsonify([])

    spotify_token = get_spotify_token()
    if not spotify_token:
        return jsonify({"error": "Spotify service unavailable"}), 503

    try:
        url = f"https://api.spotify.com/v1/search?q={query}&type=track&limit=10"
        headers = {"Authorization": f"Bearer {spotify_token}"}
        response = requests.get(url, headers=headers)
        response.raise_for_status()
        
        tracks = response.json().get("tracks", {}).get("items", [])
        results = [{
            "id": track["id"],  # This is the correct Spotify track ID
            "title": track["name"],
            "artist": track["artists"][0]["name"],
            "image": track["album"]["images"][0]["url"] if track["album"]["images"] else None,
            "spotify_id": track["id"]  # Add spotify_id explicitly
        } for track in tracks]
        
        return jsonify(results)
    except Exception as e:
        logging.error(f"Spotify search error: {str(e)}")
        return jsonify({"error": "Search failed"}), 500

def async_route(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        return asyncio.run(f(*args, **kwargs))
    return wrapper

@app.route('/api/recommendations')
@async_route
async def recommendations():
    """Get recommendations using Last.fm with Deezer fallback"""
    track = request.args.get('track')
    artist = request.args.get('artist')
    if not track or not artist:
        return jsonify([])

    try:
        results = []
        # Try Last.fm first
        lastfm_url = f"http://ws.audioscrobbler.com/2.0/?method=track.getsimilar&artist={artist}&track={track}&api_key={LASTFM_API_KEY}&format=json&limit=20"
        async with ClientSession() as session:
            async with session.get(lastfm_url) as response:
                lastfm_data = await response.json()
                tracks = lastfm_data.get("similartracks", {}).get("track", [])
        
        # If Last.fm doesn't return results, fallback to Deezer
        if not tracks:
            logging.info("No Last.fm results, falling back to Deezer recommendations")
            deezer_search = f"{DEEZER_API_URL}?q=artist:\"{artist}\""
            async with ClientSession() as session:
                async with session.get(deezer_search) as response:
                    deezer_data = await response.json()
                    
                    if deezer_data.get("data"):
                        artist_id = deezer_data["data"][0].get("artist", {}).get("id")
                        if artist_id:
                            similar_url = f"https://api.deezer.com/artist/{artist_id}/related"
                            async with session.get(similar_url) as similar_response:
                                similar_artists = (await similar_response.json()).get("data", [])
                                
                                for similar_artist in similar_artists[:5]:
                                    artist_tracks_url = f"https://api.deezer.com/artist/{similar_artist['id']}/top"
                                    async with session.get(artist_tracks_url) as tracks_response:
                                        artist_tracks = (await tracks_response.json()).get("data", [])
                                        
                                        for track in artist_tracks[:4]:
                                            spotify_id = await get_spotify_id(track["title"], track["artist"]["name"])
                                            results.append({
                                                "id": spotify_id or str(track["id"]),
                                                "title": track["title"],
                                                "artist": track["artist"]["name"],
                                                "image": track["album"]["cover_xl"],
                                                "preview_url": track["preview"],
                                                "spotify_id": spotify_id
                                            })
        else:
            # Process Last.fm results
            for track in tracks:
                try:
                    track_name = track["name"]
                    artist_name = track["artist"]["name"]
                    spotify_id = await get_spotify_id(track_name, artist_name)
                    
                    # Get preview URL from Deezer
                    deezer_search = f"{DEEZER_API_URL}?q=track:\"{track_name}\" artist:\"{artist_name}\""
                    async with ClientSession() as session:
                        async with session.get(deezer_search) as response:
                            deezer_data = await response.json()
                            preview_url = None
                            deezer_image = None
                            
                            if deezer_data.get("data"):
                                preview_url = deezer_data["data"][0].get("preview")
                                deezer_image = deezer_data["data"][0].get("album", {}).get("cover_xl")

                    results.append({
                        "id": spotify_id or track.get("mbid", ""),
                        "title": track_name,
                        "artist": artist_name,
                        "image": deezer_image or track.get("image", [{}])[-1].get("#text"),
                        "preview_url": preview_url,
                        "spotify_id": spotify_id
                    })

                except Exception as e:
                    logging.error(f"Error processing track: {str(e)}")
                    continue

        return jsonify(results)

    except Exception as e:
        logging.error(f"Recommendations error: {str(e)}")
        return jsonify({"error": "Failed to fetch recommendations"}), 500

async def get_spotify_id(title, artist):
    """Get Spotify track ID for a song."""
    try:
        spotify_token = get_spotify_token()
        if not spotify_token:
            return None

        query = f"track:{title} artist:{artist}"
        url = f"https://api.spotify.com/v1/search?q={query}&type=track&limit=1"
        headers = {"Authorization": f"Bearer {spotify_token}"}
        
        async with aiohttp.ClientSession() as session:
            async with session.get(url, headers=headers) as response:
                if response.status == 200:
                    data = await response.json()
                    if data.get("tracks", {}).get("items"):
                        return data["tracks"]["items"][0]["id"]
    except Exception as e:
        logging.error(f"Error getting Spotify ID: {e}")
    return None

@app.route('/deezer_preview')
def deezer_preview():
    track = request.args.get('track')
    artist = request.args.get('artist')
    if not track or not artist:
        return jsonify({"error": "Missing track or artist"}), 400

    try:
        url = f"{DEEZER_API_URL}?q=track:\"{track}\" artist:\"{artist}\""
        response = requests.get(url)
        if response.status == 200:
            data = response.json()
            if data["data"]:
                preview_url = data["data"][0].get("preview", "")
                return redirect(preview_url)  # Return direct preview URL
        return "", 404
    except Exception as e:
        logging.error(f"Deezer preview error: {e}")
        return "", 500

@app.route('/api/preview', methods=['GET'])
def get_preview():
    """Get preview URL from Deezer"""
    track = request.args.get('track')
    artist = request.args.get('artist')
    
    if not track or not artist:
        return jsonify({"error": "Missing track or artist"}), 400

    try:
        url = f"{DEEZER_API_URL}?q=track:\"{track}\" artist:\"{artist}\""
        response = requests.get(url)
        if response.ok:
            data = response.json()
            if data.get("data") and len(data["data"]) > 0:
                preview_url = data["data"][0].get("preview")
                if preview_url:
                    return jsonify({"preview_url": preview_url})
        return jsonify({"error": "No preview available"}), 404
    except Exception as e:
        logging.error(f"Preview error: {e}")
        return jsonify({"error": str(e)}), 500

# ✅ Check Login Status
@app.route('/api/check_login', methods=['GET'])
def check_login():
    if 'user_id' in session:
        return jsonify({"logged_in": True})
    return jsonify({"logged_in": False})

# Change the register route to handle API requests
@app.route('/api/register', methods=['POST'])
def register():
    """Handle user registration"""
    try:
        data = request.json
        print("Registration data received:", data)  # Debug print

        # Check for required fields
        required_fields = ['username', 'password', 'email', 'firstname', 'lastname']
        if not all(data.get(field) for field in required_fields):
            print("Missing required fields")  # Debug print
            missing = [field for field in required_fields if not data.get(field)]
            return jsonify({
                "error": f"Missing required fields: {', '.join(missing)}"
            }), 400

        # Create new user
        user_id = db.create_user(
            username=data['username'],
            password=data['password'],
            firstname=data['firstname'],
            lastname=data['lastname'],
            email=data['email'],
            age=data.get('dob'),
            sex=data.get('sex'),
            country=data.get('country')
        )

        if user_id:
            return jsonify({
                "success": True, 
                "message": "Registration successful",
                "user_id": user_id
            }), 200
        else:
            return jsonify({
                "error": "Failed to create user. Username or email might already exist."
            }), 409

    except Exception as e:
        print(f"Registration error: {str(e)}")  # Debug print
        return jsonify({"error": str(e)}), 500

# Change the login route to handle API requests
@app.route('/api/login', methods=['POST'])
def login():
    """Handle user login"""
    try:
        data = request.json
        print("Login data received:", data)  # Debug log

        if not data or 'username' not in data or 'password' not in data:
            return jsonify({"error": "Missing credentials"}), 400

        user = db.verify_user(data['username'], data['password'])
        
        if user:
            session['user_id'] = user['id']
            return jsonify({"success": True, "message": "Login successful"}), 200
        else:
            return jsonify({"error": "Invalid credentials"}), 401

    except Exception as e:
        print(f"Login error: {str(e)}")  # Debug log
        return jsonify({"error": str(e)}), 500

# Add logout API endpoint
@app.route('/api/logout', methods=['POST'])
def logout():
    session.pop('user_id', None)
    return jsonify({"success": True, "message": "Logout successful"})

# ✅ Like a Song
@app.route('/api/songs/like', methods=['POST', 'DELETE'])
def handle_like():
    if 'user_id' not in session:
        return jsonify({"error": "Not logged in"}), 401

    user_id = session['user_id']
    song_data = request.json

    if request.method == 'POST':
        success = db.save_song(user_id, song_data)
        if success:
            return jsonify({"message": "Song liked"}), 200
        return jsonify({"error": "Failed to like song"}), 500
    else:
        success = db.remove_song(user_id, song_data['track_id'])
        if success:
            return jsonify({"message": "Song unliked"}), 200
        return jsonify({"error": "Failed to unlike song"}), 500

@app.route('/api/songs/like', methods=['GET'])
def get_liked_songs():
    if 'user_id' not in session:
        return jsonify({"error": "Not logged in"}), 401
    
    liked_songs = db.get_liked_songs(session['user_id'])
    return jsonify(liked_songs)

@app.route('/api/songs/hidden', methods=['GET'])
def get_hidden_songs():
    if 'user_id' not in session:
        return jsonify({"error": "Not logged in"}), 401
    
    hidden_songs = db.get_hidden_songs(session['user_id'])
    return jsonify(hidden_songs)

@app.route('/api/songs/unhide', methods=['POST'])
def unhide_song():
    if 'user_id' not in session:
        return jsonify({"error": "Not logged in"}), 401

    song_data = request.json
    success = db.unhide_song(session['user_id'], song_data['track_id'])
    if success:
        return jsonify({"message": "Song unhidden"}), 200
    return jsonify({"error": "Failed to unhide song"}), 500

@app.route('/api/songs/hide', methods=['POST'])
def hide_song():
    if 'user_id' not in session:
        return jsonify({"error": "Not logged in"}), 401

    user_id = session['user_id']
    song_data = request.json
    if db.hide_song(user_id, song_data):
        return jsonify({"message": "Song hidden"}), 200
    return jsonify({"error": "Failed to hide song"}), 500

# ✅ Run Flask Server
if __name__ == '__main__':
    app.run(debug=True)
