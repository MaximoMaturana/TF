# TuneFuse

TuneFuse is a music recommendation application that combines the power of Spotify, Last.fm, and Deezer to help users discover new music.

## Features

- Search for songs using Spotify's database
- Get song recommendations from Last.fm
- Listen to song previews from Deezer
- Save favorite songs
- Hide unwanted recommendations
- User authentication system

## Setup Instructions

1. Clone the repository
2. Create a virtual environment:
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```
3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
4. Copy the provided .env file to the project root
5. Run the application:
   ```bash
   python main.py
   ```

## Requirements
- Python 3.8+
- The provided .env file for authentication
