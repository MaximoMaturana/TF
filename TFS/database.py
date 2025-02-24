import sqlite3
from datetime import datetime
from werkzeug.security import generate_password_hash, check_password_hash

class Database:
    def __init__(self, db_name='tunefuse.db'):
        self.conn = sqlite3.connect(db_name, check_same_thread=False)
        self.cursor = self.conn.cursor()
        self.create_tables()

    def create_tables(self):
        """Creates necessary database tables for users, saved songs, and hidden songs."""
        # Users table with corrected field names
        self.cursor.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            firstname TEXT NOT NULL,
            lastname TEXT NOT NULL,
            dob TEXT,           -- Changed from age to dob
            sex TEXT,
            country TEXT,
            spotify_id TEXT UNIQUE
        )
        ''')

        # Saved songs table
        self.cursor.execute('''
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

        # Hidden songs table
        self.cursor.execute('''
        CREATE TABLE IF NOT EXISTS hidden_songs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            track_id TEXT UNIQUE NOT NULL,
            track_name TEXT NOT NULL,
            artist_name TEXT NOT NULL,
            album_cover TEXT,
            hidden_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
        )
        ''')

        self.conn.commit()

    ### ✅ USER AUTHENTICATION ###
    def check_existing_user(self, username, email):
        """Check if username or email already exists."""
        try:
            self.cursor.execute('SELECT id FROM users WHERE username = ? OR email = ?', 
                              (username, email))
            return self.cursor.fetchone() is not None
        except Exception as e:
            print(f"Error checking existing user: {e}")
            return False

    def create_user(self, username, password, firstname, lastname, email, age=None, sex=None, country=None):
        """Create a new user with the given details."""
        try:
            # Check if user exists first
            if self.check_existing_user(username, email):
                print("User already exists")
                return None

            # Hash password
            hashed_password = generate_password_hash(password)
            
            # Insert new user
            query = '''
                INSERT INTO users 
                (username, password, firstname, lastname, email, dob, sex, country)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            '''
            self.cursor.execute(query, (
                username, 
                hashed_password, 
                firstname, 
                lastname, 
                email, 
                age, 
                sex, 
                country
            ))
            
            self.conn.commit()
            new_user_id = self.cursor.lastrowid
            print(f"Successfully created user with ID: {new_user_id}")
            return new_user_id

        except sqlite3.IntegrityError as e:
            print(f"IntegrityError in create_user: {e}")
            self.conn.rollback()
            return None
        except Exception as e:
            print(f"Unexpected error in create_user: {e}")
            self.conn.rollback()
            return None

    def verify_user(self, username, password):
        """Verify user credentials and return user data if valid."""
        try:
            query = '''
                SELECT id, username, password, email 
                FROM users 
                WHERE username = ? OR email = ?
            '''
            self.cursor.execute(query, (username, username))
            
            user = self.cursor.fetchone()
            if not user:
                print("User not found")
                return None

            if check_password_hash(user[2], password):
                return {
                    "id": user[0],
                    "username": user[1],
                    "email": user[3]
                }
                
            print("Invalid password")
            return None

        except Exception as e:
            print(f"Error in verify_user: {e}")
            return None

    def save_song(self, user_id, song_data):
        """Save a song to liked songs."""
        try:
            self.cursor.execute('''
                INSERT INTO saved_songs (user_id, track_id, track_name, artist_name, album_cover)
                VALUES (?, ?, ?, ?, ?)
            ''', (user_id, song_data.get('spotify_id', song_data['track_id']), 
                  song_data['track_name'], song_data['artist_name'], 
                  song_data.get('album_cover')))
            self.conn.commit()
            return True
        except sqlite3.Error as e:
            print(f"Error saving song: {e}")
            return False

    def remove_song(self, user_id, track_id):
        """Remove a song from liked songs."""
        try:
            self.cursor.execute('''
                DELETE FROM saved_songs 
                WHERE user_id = ? AND track_id = ?
            ''', (user_id, track_id))
            self.conn.commit()
            return True
        except sqlite3.Error as e:
            print(f"Error removing song: {e}")
            return False

    def unhide_song(self, user_id, track_id):
        """Remove a song from hidden songs."""
        try:
            self.cursor.execute('''
                DELETE FROM hidden_songs 
                WHERE user_id = ? AND track_id = ?
            ''', (user_id, track_id))
            self.conn.commit()
            return True
        except sqlite3.Error as e:
            print(f"Error unhiding song: {e}")
            return False

    def get_hidden_songs(self, user_id):
        """Get all hidden songs for a user."""
        try:
            self.cursor.execute('''
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
            } for row in self.cursor.fetchall()]
        except sqlite3.Error as e:
            print(f"Error getting hidden songs: {e}")
            return []

    def get_liked_songs(self, user_id):
        """Get all liked songs for a user."""
        try:
            self.cursor.execute('''
                SELECT track_id, track_name, artist_name, album_cover, saved_at
                FROM saved_songs 
                WHERE user_id = ?
                ORDER BY saved_at DESC
            ''', (user_id,))
            rows = self.cursor.fetchall()
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

    def hide_song(self, user_id, song_data):
        """Hide a song from recommendations."""
        try:
            self.cursor.execute('''
                INSERT INTO hidden_songs 
                (user_id, track_id, track_name, artist_name, album_cover)
                VALUES (?, ?, ?, ?, ?)
            ''', (user_id, song_data.get('spotify_id', song_data['track_id']), 
                  song_data['track_name'], song_data['artist_name'], 
                  song_data.get('album_cover')))
            self.conn.commit()
            return True
        except sqlite3.Error as e:
            print(f"Error hiding song: {e}")
            return False
