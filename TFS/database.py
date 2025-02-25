"""
TuneFuse Database Manager

This is where we store all our data! Think of it as our music diary where we keep track of:
- Who our users are
- What songs they love
- What songs they'd rather not see again

It's like a personal music notebook for each user! 📝
"""

import sqlite3
import logging
from datetime import datetime
from werkzeug.security import generate_password_hash, check_password_hash

class Database:
    def __init__(self, db_name='tunefuse.db'):
        """Start up our music diary"""
        self.db_name = db_name  # Store the database name
        self._create_tables()    # Initialize tables once

    def _get_connection(self):
        """Get a new database connection"""
        return sqlite3.connect(self.db_name)

    def _create_tables(self):
        """Set up our music diary with different sections"""
        conn = self._get_connection()
        try:
            cursor = conn.cursor()
            # Create users table
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    username TEXT UNIQUE NOT NULL,
                    password TEXT NOT NULL,
                    email TEXT UNIQUE NOT NULL,
                    firstname TEXT NOT NULL,
                    lastname TEXT NOT NULL,
                    dob TEXT,
                    sex TEXT,
                    country TEXT,
                    spotify_id TEXT UNIQUE
                )
            ''')

            # Create saved_songs table
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS saved_songs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER,
                    track_id TEXT NOT NULL,
                    track_name TEXT NOT NULL,
                    artist_name TEXT NOT NULL,
                    album_cover TEXT,
                    saved_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES users (id)
                )
            ''')

            # Create hidden_songs table
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS hidden_songs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    track_id TEXT NOT NULL,
                    track_name TEXT NOT NULL,
                    artist_name TEXT NOT NULL,
                    album_cover TEXT,
                    hidden_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES users (id)
                )
            ''')
            conn.commit()
        finally:
            conn.close()

    ### ✅ USER AUTHENTICATION ###
    def create_user(self, username, password, firstname, lastname, email, age=None, sex=None, country=None):
        """Create a new user with the given details."""
        conn = None
        try:
            conn = self._get_connection()
            cursor = conn.cursor()
            
            # Single atomic transaction for checking and inserting
            with conn:
                # First check for existing username/email
                cursor.execute('''
                    SELECT username, email FROM users 
                    WHERE LOWER(username) = LOWER(?) OR LOWER(email) = LOWER(?)
                ''', (username, email))
                
                existing = cursor.fetchone()
                if existing:
                    if existing[0].lower() == username.lower():
                        return {"success": False, "error": "username_taken"}
                    if existing[1].lower() == email.lower():
                        return {"success": False, "error": "email_taken"}

                # If we get here, neither username nor email exists
                hashed_password = generate_password_hash(password)
                cursor.execute('''
                    INSERT INTO users 
                    (username, password, firstname, lastname, email, dob, sex, country)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ''', (username, hashed_password, firstname, lastname, email, age, sex, country))
                
                return {"success": True, "user_id": cursor.lastrowid}

        except sqlite3.IntegrityError as e:
            logging.error(f"Database integrity error: {e}")
            return {"success": False, "error": "database_error"}
        except Exception as e:
            logging.error(f"Unexpected error in create_user: {e}")
            return {"success": False, "error": "unexpected_error"}
        finally:
            if conn:
                conn.close()

    def verify_user(self, username, password):
        """Verify user credentials and return user data if valid."""
        conn = None
        try:
            conn = self._get_connection()
            cursor = conn.cursor()
            
            # First try direct username comparison
            cursor.execute('''
                SELECT id, username, password, email 
                FROM users 
                WHERE username = ?
            ''', (username,))
            
            user = cursor.fetchone()
            
            # If not found, try case-insensitive username
            if not user:
                cursor.execute('''
                    SELECT id, username, password, email 
                    FROM users 
                    WHERE LOWER(username) = LOWER(?)
                ''', (username,))
                user = cursor.fetchone()
            
            # If still not found, try email
            if not user:
                cursor.execute('''
                    SELECT id, username, password, email 
                    FROM users 
                    WHERE LOWER(email) = LOWER(?)
                ''', (username,))
                user = cursor.fetchone()

            if user:
                if check_password_hash(user[2], password):
                    logging.info(f"Login successful: {user[1]}")
                    return {
                        "id": user[0],
                        "username": user[1],
                        "email": user[3]
                    }
                else:
                    logging.warning(f"Invalid password for user: {username}")
                    return {"error": "invalid_password"}
            else:
                logging.warning(f"User not found: {username}")
                return {"error": "user_not_found"}

        except Exception as e:
            logging.error(f"Database error in verify_user: {e}")
            return {"error": "database_error"}
        finally:
            if conn:
                conn.close()

    def save_song(self, user_id, song_data):
        """Save a song to liked songs."""
        conn = self._get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute('''
                INSERT INTO saved_songs (user_id, track_id, track_name, artist_name, album_cover)
                VALUES (?, ?, ?, ?, ?)
            ''', (user_id, song_data.get('spotify_id', song_data['track_id']), 
                  song_data['track_name'], song_data['artist_name'], 
                  song_data.get('album_cover')))
            conn.commit()
            return True
        except sqlite3.Error as e:
            print(f"Error saving song: {e}")
            return False
        finally:
            conn.close()

    def remove_song(self, user_id, track_id):
        """Remove a song from liked songs."""
        conn = self._get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute('''
                DELETE FROM saved_songs 
                WHERE user_id = ? AND track_id = ?
            ''', (user_id, track_id))
            conn.commit()
            return True
        except sqlite3.Error as e:
            print(f"Error removing song: {e}")
            return False
        finally:
            conn.close()

    def unhide_song(self, user_id, track_id):
        """Remove a song from hidden songs."""
        conn = self._get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute('''
                DELETE FROM hidden_songs 
                WHERE user_id = ? AND track_id = ?
            ''', (user_id, track_id))
            conn.commit()
            return True
        except sqlite3.Error as e:
            print(f"Error unhiding song: {e}")
            return False
        finally:
            conn.close()

    def get_hidden_songs(self, user_id):
        """Get all hidden songs for a user."""
        conn = self._get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute('''
                SELECT track_id, track_name, artist_name, hidden_at, album_cover
                FROM hidden_songs 
                WHERE user_id = ?
                ORDER BY hidden_at DESC
            ''', (user_id,))
            return [{
                'id': row[0],  # This is now the Spotify ID
                'spotify_id': row[0],  # Add explicit Spotify ID
                'title': row[1],
                'artist': row[2],
                'date': row[3],
                'album_cover': row[4]
            } for row in cursor.fetchall()]
        except sqlite3.Error as e:
            print(f"Error getting hidden songs: {e}")
            return []
        finally:
            conn.close()

    def get_liked_songs(self, user_id):
        """Get all liked songs for a user."""
        conn = self._get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute('''
                SELECT track_id, track_name, artist_name, album_cover, saved_at
                FROM saved_songs 
                WHERE user_id = ?
                ORDER BY saved_at DESC
            ''', (user_id,))
            rows = cursor.fetchall()
            return [{
                'track_id': row[0],  # This is now the Spotify ID
                'spotify_id': row[0],  # Add explicit Spotify ID
                'track_name': row[1],
                'artist_name': row[2],
                'album_cover': row[3],
                'saved_at': row[4]
            } for row in rows]
        except sqlite3.Error as e:
            print(f"Error getting liked songs: {e}")
            return []
        finally:
            conn.close()

    def hide_song(self, user_id, song_data):
        """Hide a song from recommendations."""
        conn = self._get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute('''
                INSERT INTO hidden_songs 
                (user_id, track_id, track_name, artist_name, album_cover)
                VALUES (?, ?, ?, ?, ?)
            ''', (user_id, song_data.get('spotify_id', song_data['track_id']), 
                  song_data['track_name'], song_data['artist_name'], 
                  song_data.get('album_cover')))
            conn.commit()
            return True
        except sqlite3.Error as e:
            print(f"Error hiding song: {e}")
            return False
        finally:
            conn.close()
