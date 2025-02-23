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
from datetime import timedelta

# Load environment variables
load_dotenv()
SPOTIFY_CLIENT_ID = os.getenv("SPOTIFY_CLIENT_ID")
SPOTIFY_CLIENT_SECRET = os.getenv("SPOTIFY_CLIENT_SECRET")
SPOTIFY_REDIRECT_URI = os.getenv("SPOTIFY_REDIRECT_URI")
LASTFM_API_KEY = os.getenv("LASTFM_API_KEY")
DEEZER_API_URL = "https://api.deezer.com/search"

# Initialize Flask app
app = Flask(__name__, 
    static_folder='assets',
    static_url_path=''
)
app.secret_key = os.urandom(24)
app.config['SESSION_COOKIE_SECURE'] = False  # For development
app.config['SESSION_COOKIE_HTTPONLY'] = True
app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(days=7)

# Initialize database
db = Database()

# Configure logging
logging.basicConfig(level=logging.DEBUG)

def get_spotify_token():
    """Get or refresh Spotify access token."""
    try:
        auth_string = f"{SPOTIFY_CLIENT_ID}:{SPOTIFY_CLIENT_SECRET}"
        auth_bytes = auth_string.encode('utf-8')
        auth_base64 = str(base64.b64encode(auth_bytes), 'utf-8')
        
        url = "https://accounts.spotify.com/api/token"
        headers = {
            "Authorization": f"Basic {auth_base64}",
            "Content-Type": "application/x-www-form-urlencoded"
        }
        data = {"grant_type": "client_credentials"}
        
        result = requests.post(url, headers=headers, data=data)
        result.raise_for_status()  # Will raise an exception for HTTP errors
        json_result = result.json()
        token = json_result.get("access_token")
        
        if not token:
            raise Exception("No token received from Spotify")
            
        return token
    except Exception as e:
        logging.error(f"Error getting Spotify token: {e}")
        return None

def async_route(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        return asyncio.run(f(*args, **kwargs))
    return wrapper

# Routes
@app.route('/')
def home():
    return render_template('index.html')

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
            "id": track["id"],
            "title": track["name"],
            "artist": track["artists"][0]["name"],
            "image": track["album"]["images"][0]["url"] if track["album"]["images"] else None,
            "spotify_id": track["id"]
        } for track in tracks]
        
        return jsonify(results)
    except Exception as e:
        logging.error(f"Spotify search error: {str(e)}")
        return jsonify({"error": "Search failed"}), 500

@app.route('/api/check_login')
def check_login():
    """Check if user is logged in"""
    return jsonify({
        "logged_in": 'user_id' in session
    })

# Auth routes
@app.route('/api/register', methods=['POST'])
def register():
    """Handle user registration"""
    try:
        data = request.json
        required_fields = ['username', 'password', 'email', 'firstname', 'lastname']
        if not all(data.get(field) for field in required_fields):
            missing = [field for field in required_fields if not data.get(field)]
            return jsonify({
                "error": f"Missing required fields: {', '.join(missing)}"
            }), 400

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
        logging.error(f"Registration error: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/login', methods=['POST'])
def login():
    """Handle user login"""
    try:
        data = request.json
        if not data or 'username' not in data or 'password' not in data:
            return jsonify({"error": "Missing credentials"}), 400

        user = db.verify_user(data['username'], data['password'])
        
        if user:
            session['user_id'] = user['id']
            return jsonify({"success": True, "message": "Login successful"}), 200
        else:
            return jsonify({"error": "Invalid credentials"}), 401

    except Exception as e:
        logging.error(f"Login error: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/logout', methods=['POST'])
def logout():
    session.pop('user_id', None)
    return jsonify({"success": True, "message": "Logout successful"})

# Song management routes
@app.route('/api/songs/like', methods=['GET', 'POST', 'DELETE'])
def handle_like():
    """Handle liking/unliking songs and getting liked songs"""
    if 'user_id' not in session:
        return jsonify({"error": "Not logged in"}), 401

    user_id = session['user_id']

    if request.method == 'GET':
        liked_songs = db.get_liked_songs(user_id)
        return jsonify(liked_songs)
    
    song_data = request.json
    
    if request.method == 'POST':
        success = db.save_song(user_id, song_data)
        if success:
            return jsonify({"message": "Song liked"}), 200
        return jsonify({"error": "Failed to like song"}), 500
    
    elif request.method == 'DELETE':
        success = db.remove_song(user_id, song_data['track_id'])
        if success:
            return jsonify({"message": "Song unliked"}), 200
        return jsonify({"error": "Failed to unlike song"}), 500

@app.route('/api/songs/hide', methods=['POST'])
def hide_song():
    """Handle hiding songs"""
    if 'user_id' not in session:
        return jsonify({"error": "Not logged in"}), 401

    user_id = session['user_id']
    song_data = request.json
    
    if db.hide_song(user_id, song_data):
        return jsonify({"message": "Song hidden"}), 200
    return jsonify({"error": "Failed to hide song"}), 500

@app.route('/api/songs/hidden', methods=['GET'])
def get_hidden_songs():
    """Get list of hidden songs"""
    if 'user_id' not in session:
        return jsonify({"error": "Not logged in"}), 401
    
    hidden_songs = db.get_hidden_songs(session['user_id'])
    return jsonify(hidden_songs)

@app.route('/api/songs/unhide', methods=['POST'])
def unhide_song():
    """Handle unhiding songs"""
    if 'user_id' not in session:
        return jsonify({"error": "Not logged in"}), 401

    song_data = request.json
    success = db.unhide_song(session['user_id'], song_data['track_id'])
    
    if success:
        return jsonify({"message": "Song unhidden"}), 200
    return jsonify({"error": "Failed to unhide song"}), 500

@app.route('/api/recommendations')
@async_route
async def recommendations():
    """Get recommendations from Last.fm with Deezer fallback"""
    track = request.args.get('track')
    artist = request.args.get('artist')
    
    if not track or not artist:
        return jsonify({"error": "Missing track or artist"}), 400

    try:
        results = []
        recommendation_source = "lastfm"  # Default source
        
        # Try Last.fm first
        lastfm_url = f"http://ws.audioscrobbler.com/2.0/?method=track.getsimilar&artist={artist}&track={track}&api_key={LASTFM_API_KEY}&format=json&limit=20"
        async with ClientSession() as session:
            async with session.get(lastfm_url) as response:
                if response.status != 200:
                    logging.warning("Last.fm request failed, falling back to Deezer")
                    recommendation_source = "deezer"
                else:
                    data = await response.json()
                    similar_tracks = data.get('similartracks', {}).get('track', [])
                    if not similar_tracks:
                        recommendation_source = "deezer"
                        logging.info("No Last.fm results, falling back to Deezer")
                    else:
                        for track in similar_tracks:
                            try:
                                preview_url = None
                                album_image = None
                                spotify_id = None
                                
                                # Get Deezer preview and image
                                deezer_url = f"{DEEZER_API_URL}?q=track:\"{track['name']}\" artist:\"{track['artist']['name']}\""
                                async with session.get(deezer_url) as deezer_response:
                                    if deezer_response.status == 200:
                                        deezer_data = await deezer_response.json()
                                        if deezer_data.get('data'):
                                            preview_url = deezer_data['data'][0].get('preview')
                                            album_image = deezer_data['data'][0].get('album', {}).get('cover_xl')
                                
                                # Get Spotify ID
                                spotify_token = get_spotify_token()
                                if spotify_token:
                                    spotify_url = f"https://api.spotify.com/v1/search?q=track:{track['name']} artist:{track['artist']['name']}&type=track&limit=1"
                                    headers = {"Authorization": f"Bearer {spotify_token}"}
                                    async with session.get(spotify_url, headers=headers) as spotify_response:
                                        if spotify_response.status == 200:
                                            spotify_data = await spotify_response.json()
                                            if spotify_data.get('tracks', {}).get('items'):
                                                spotify_id = spotify_data['tracks']['items'][0]['id']
                                
                                results.append({
                                    "id": spotify_id or track.get('mbid', ''),
                                    "title": track['name'],
                                    "artist": track['artist']['name'],
                                    "image": album_image or track.get('image', [{}])[-1].get('#text'),
                                    "preview_url": preview_url,
                                    "spotify_id": spotify_id
                                })
                            except Exception as e:
                                logging.error(f"Error processing Last.fm track: {e}")
                                continue

            # If Last.fm failed or returned no results, use Deezer as fallback
            if recommendation_source == "deezer":
                logging.info("Using Deezer fallback for recommendations")
                # First get the artist ID from Deezer
                deezer_search = f"{DEEZER_API_URL}?q=artist:\"{artist}\""
                async with session.get(deezer_search) as response:
                    deezer_data = await response.json()
                    if deezer_data.get("data"):
                        artist_id = deezer_data["data"][0].get("artist", {}).get("id")
                        if artist_id:
                            # Get related artists
                            similar_url = f"https://api.deezer.com/artist/{artist_id}/related"
                            async with session.get(similar_url) as similar_response:
                                similar_artists = (await similar_response.json()).get("data", [])
                                
                                for similar_artist in similar_artists[:5]:  # Get top 5 similar artists
                                    # Get top tracks for each similar artist
                                    artist_tracks_url = f"https://api.deezer.com/artist/{similar_artist['id']}/top"
                                    async with session.get(artist_tracks_url) as tracks_response:
                                        artist_tracks = (await tracks_response.json()).get("data", [])
                                        
                                        for track in artist_tracks[:4]:  # Get top 4 tracks per artist
                                            spotify_id = None
                                            if get_spotify_token():
                                                # Try to get Spotify ID
                                                spotify_url = f"https://api.spotify.com/v1/search?q=track:{track['title']} artist:{track['artist']['name']}&type=track&limit=1"
                                                headers = {"Authorization": f"Bearer {get_spotify_token()}"}
                                                async with session.get(spotify_url, headers=headers) as spotify_response:
                                                    if spotify_response.status == 200:
                                                        spotify_data = await spotify_response.json()
                                                        if spotify_data.get('tracks', {}).get('items'):
                                                            spotify_id = spotify_data['tracks']['items'][0]['id']
                                            
                                            results.append({
                                                "id": spotify_id or str(track["id"]),
                                                "title": track["title"],
                                                "artist": track["artist"]["name"],
                                                "image": track["album"]["cover_xl"],
                                                "preview_url": track["preview"],
                                                "spotify_id": spotify_id
                                            })

            # Add source to response
            return jsonify({
                "source": recommendation_source,
                "results": results
            })

    except Exception as e:
        logging.error(f"Recommendations error: {str(e)}")
        return jsonify({"error": "Failed to fetch recommendations"}), 500

if __name__ == '__main__':
    app.run(debug=True)
