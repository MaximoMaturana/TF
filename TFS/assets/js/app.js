/*
TuneFuse Frontend 
This is where all the interactive stuff happens:
- Making the stars twinkle in the background
- Searching for songs
- Showing recommendations
- Handling likes and hides
- Making the modals pop up and disappear
- Keeping track of who's logged in
*/

document.addEventListener('DOMContentLoaded', function() {
    // Let's get this party started! 🎉
    const searchInput = document.getElementById('searchInput');
    const suggestionsDiv = document.getElementById('suggestions');
    const resultsDiv = document.getElementById('results');
    
    // Make our background all sparkly ✨
    initializeStarfield();
    
    // Set up all our buttons and forms
    setupEventListeners();
    
    // Check if someone's already logged in
    checkLoginStatus();
});

// Core functionality implementations
function initializeStarfield() {
    const starfield = document.getElementById('starfield');
    for (let i = 0; i < 100; i++) {
        const star = document.createElement('div');
        star.className = 'star';
        star.style.left = Math.random() * 100 + '%';
        star.style.top = Math.random() * 100 + '%';
        star.style.animationDuration = (Math.random() * 3 + 2) + 's';
        starfield.appendChild(star);
    }
}

// Move timeoutId to global scope
let timeoutId;

function setupEventListeners() {
    // Search functionality
    const searchInput = document.getElementById('searchInput');
    searchInput.addEventListener('input', handleSearchInput);
    
    // Form submissions
    document.getElementById('loginForm').addEventListener('submit', handleLogin);
    document.getElementById('registerForm').addEventListener('submit', handleRegister);
    
    // Password validation
    setupPasswordValidation();
    
    // Modal handlers
    setupModalHandlers();
    
    // Add country selector initialization
    initializeCountrySelector();
}

// API interaction functions
async function handleSearchInput(e) {
    clearTimeout(timeoutId);
    const query = e.target.value.trim();
    const suggestionsDiv = document.getElementById('suggestions');
    
    if (query.length < 2) {
        suggestionsDiv.style.display = 'none';
        return;
    }

    timeoutId = setTimeout(async () => {
        try {
            const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
            const data = await response.json();
            
            suggestionsDiv.innerHTML = '';
            
            if (data.length > 0) {
                suggestionsDiv.style.display = 'block';
                data.forEach(song => {
                    const div = document.createElement('div');
                    div.className = 'suggestion-item';
                    div.innerHTML = `
                        <img src="${song.image || '/images/default-album.png'}" 
                             alt="${song.title}"
                             onerror="this.src='/images/default-album.png'">
                        <div class="suggestion-text">
                            <div>${song.title}</div>
                            <div style="color: #888; font-size: 0.9em;">${song.artist}</div>
                        </div>
                    `;
                    div.onclick = () => {
                        showSongDetails(song);
                        suggestionsDiv.style.display = 'none';
                    };
                    suggestionsDiv.appendChild(div);
                });
            } else {
                suggestionsDiv.style.display = 'none';
            }
        } catch (error) {
            console.error('Search error:', error);
            suggestionsDiv.style.display = 'none';
        }
    }, 300);
}

async function showSongDetails(song) {
    try {
        document.getElementById('loadingOverlay').classList.add('active');
        const suggestionsDiv = document.getElementById('suggestions');
        const resultsDiv = document.getElementById('results');
        suggestionsDiv.style.display = 'none';

        const response = await fetch(`/api/recommendations?track=${encodeURIComponent(song.title)}&artist=${encodeURIComponent(song.artist)}`);
        
        if (!response.ok) {
            throw new Error('Failed to fetch recommendations');
        }

        const data = await response.json();
        resultsDiv.innerHTML = '';
        
        // Log recommendation source
        console.log(`Recommendations provided by: ${data.source}`);
        
        if (data.results && data.results.length > 0) {
            const section = document.createElement('div');
            section.className = 'recommendations-section';
            section.innerHTML = `
                <h2>Similar Songs to: ${song.title} - ${song.artist}</h2>
                <p class="recommendation-source">Recommendations by ${data.source === 'lastfm' ? 'Last.fm' : 'Deezer'}</p>
            `;
            
            const list = document.createElement('div');
            list.className = 'recommendations-list';
            
            data.results.forEach(rec => {
                const item = document.createElement('div');
                item.className = 'recommendation-item';
                item.setAttribute('data-song-id', rec.id);
                
                item.innerHTML = `
                    <img src="${rec.image || '/images/default-album.png'}" alt="${rec.title}" onerror="this.src='/images/default-album.png'">
                    <div class="song-info">
                        <div class="song-text">
                            <h3>${rec.title}</h3>
                            <p>${rec.artist}</p>
                        </div>
                        ${rec.preview_url ? `
                            <audio controls class="preview-player">
                                <source src="${rec.preview_url}" type="audio/mp3">
                            </audio>
                        ` : '<p class="no-preview">No preview available</p>'}
                    </div>
                    <div class="song-controls">
                        <button type="button" class="icon-button" onclick="likeSong('${rec.id}', '${rec.title}', '${rec.artist}', '${rec.image}', this)" title="Like this song">
                            <img src="/images/like-icon.png" alt="Like" data-liked="false">
                        </button>
                        <button type="button" class="icon-button" onclick="hideSong('${rec.id}', '${rec.title}', '${rec.artist}')" title="Hide this song">
                            <img src="/images/hide-icon.png" alt="Hide">
                        </button>
                        <a href="https://open.spotify.com/track/${rec.spotify_id || rec.id}" target="_blank" class="spotify-button">
                            <img src="/images/spotify-icon.png" alt="Spotify">
                            Play on Spotify
                        </a>
                    </div>
                `;
                
                list.appendChild(item);
            });
            
            section.appendChild(list);
            resultsDiv.appendChild(section);
        } else {
            resultsDiv.innerHTML = '<p class="no-recommendations">No recommendations found</p>';
        }
    } catch (error) {
        console.error('Error:', error);
        resultsDiv.innerHTML = '<p class="error">Error loading recommendations</p>';
    } finally {
        document.getElementById('loadingOverlay').classList.remove('active');
        document.getElementById('searchInput').value = `${song.title} - ${song.artist}`;
    }
}

// User actions
window.likeSong = async function(songId, title, artist, image, buttonElement) {
    if (!buttonElement || !songId) {
        console.error('Invalid button element or song ID');
        return;
    }

    try {
        const loginCheck = await fetch('/api/check_login');
        const loginStatus = await loginCheck.json();
        
        if (!loginStatus.logged_in) {
            alert('Please log in to like songs');
            toggleModal('loginModal');
            return;
        }

        const imgElement = buttonElement.querySelector('img');
        if (!imgElement) {
            console.error('No image element found');
            return;
        }

        const isLiked = imgElement.getAttribute('data-liked') === 'true';
        
        const response = await fetch('/api/songs/like', {
            method: isLiked ? 'DELETE' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
                track_id: songId,
                track_name: title,
                artist_name: artist,
                album_cover: image
            })
        });

        if (response.ok) {
            // Update button state
            imgElement.src = `/images/${isLiked ? 'like-icon.png' : 'like-icon-liked.png'}`;
            imgElement.setAttribute('data-liked', (!isLiked).toString());
            buttonElement.title = isLiked ? 'Like this song' : 'Unlike this song';
            
            // Remove from My Songs list if unliking
            if (isLiked) {
                const songElement = buttonElement.closest('.recommendation-item');
                if (songElement) {
                    // Check if we're in the My Songs modal
                    const mySongsModal = document.getElementById('mySongsModal');
                    if (mySongsModal.classList.contains('show')) {
                        songElement.remove();
                        // If no songs left, show empty message
                        const songsList = document.getElementById('likedSongsList');
                        if (!songsList.children.length) {
                            songsList.innerHTML = '<p class="no-songs">No liked songs yet</p>';
                        }
                    }
                }
            }
        } else {
            throw new Error('Failed to update song like status');
        }
    } catch (error) {
        console.error('Error updating song like status:', error);
        alert('Failed to update song. Please try again.');
    }
};

window.hideSong = async function(songId, title, artist, albumCover) {
    try {
        const loginCheck = await fetch('/api/check_login');
        const loginStatus = await loginCheck.json();
        
        if (!loginStatus.logged_in) {
            alert('Please log in to hide songs');
            toggleModal('loginModal');
            return;
        }

        const response = await fetch('/api/songs/hide', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
                track_id: songId,
                track_name: title,
                artist_name: artist,
                album_cover: albumCover
            })
        });

        if (response.ok) {
            // Remove song from any list where it appears
            const songElements = document.querySelectorAll(`[data-song-id="${songId}"]`);
            songElements.forEach(element => {
                element.remove();
                
                // Check parent container for empty state
                const parentContainer = element.closest('.songs-list');
                if (parentContainer && !parentContainer.children.length) {
                    if (parentContainer.id === 'likedSongsList') {
                        parentContainer.innerHTML = '<p class="no-songs">No liked songs yet</p>';
                    } else if (parentContainer.id === 'hiddenSongsList') {
                        parentContainer.innerHTML = '<p class="no-songs">No hidden songs</p>';
                    }
                }
            });
            
            console.log('Song hidden');
        } else {
            throw new Error('Failed to hide song');
        }
    } catch (error) {
        console.error('Error hiding song:', error);
        alert('Failed to hide song. Please try again.');
    }
};

window.unhideSong = async function(songId, buttonElement) {
    try {
        const response = await fetch('/api/songs/unhide', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            credentials: 'include',
            body: JSON.stringify({ track_id: songId })
        });

        if (response.ok) {
            const songElement = buttonElement.closest('.recommendation-item');
            if (songElement) {
                songElement.remove();
            }
        } else {
            throw new Error('Failed to unhide song');
        }
    } catch (error) {
        console.error('Error unhiding song:', error);
        alert('Failed to unhide song. Please try again.');
    }
};

// Modal functions
window.loadLikedSongs = async function() {
    console.log('Loading liked songs...');
    const container = document.getElementById('likedSongsList');
    
    try {
        const response = await fetch('/api/songs/like', {
            credentials: 'include',
            headers: { 'Accept': 'application/json' }
        });

        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const songs = await response.json();
        console.log('Liked songs:', songs);

        if (Array.isArray(songs) && songs.length > 0) {
            container.innerHTML = songs.map(song => `
                <div class="recommendation-item" data-song-id="${song.track_id}">
                    <img src="${song.album_cover || '/images/default-album.png'}" 
                         alt="${song.track_name}" 
                         onerror="this.src='/images/default-album.png'"
                         class="song-cover">
                    <div class="song-info">
                        <div class="song-text">
                            <h3>${song.track_name}</h3>
                            <p>${song.artist_name}</p>
                            <p class="song-date">Liked on: ${new Date(song.saved_at || Date.now()).toLocaleDateString()}</p>
                        </div>
                        <audio controls class="preview-player" preload="none">
                            <source src="/api/preview?track=${encodeURIComponent(song.track_name)}&artist=${encodeURIComponent(song.artist_name)}" type="audio/mp3">
                        </audio>
                    </div>
                    <div class="song-controls">
                        <button onclick="likeSong('${song.track_id}', '${song.track_name}', '${song.artist_name}', '${song.album_cover}', this)" 
                                class="icon-button" title="Unlike this song">
                            <img src="/images/like-icon-liked.png" alt="Unlike" data-liked="true">
                        </button>
                        <button onclick="hideSong('${song.track_id}', '${song.track_name}', '${song.artist_name}', '${song.album_cover}')" 
                                class="icon-button" title="Hide this song">
                            <img src="/images/hide-icon.png" alt="Hide">
                        </button>
                        <a href="https://open.spotify.com/track/${song.track_id}" 
                           target="_blank" 
                           class="spotify-button"
                           rel="noopener noreferrer">
                            <img src="/images/spotify-icon.png" alt="Spotify">
                            Open in Spotify
                        </a>
                    </div>
                </div>
            `).join('');
        } else {
            container.innerHTML = '<p class="no-songs">No liked songs yet</p>';
        }
    } catch (error) {
        console.error('Error loading liked songs:', error);
        container.innerHTML = '<p class="error">Error loading songs</p>';
    }
};

window.loadHiddenSongs = async function() {
    console.log('Loading hidden songs...');
    const container = document.getElementById('hiddenSongsList');
    
    try {
        const response = await fetch('/api/songs/hidden', {
            credentials: 'include',
            headers: { 'Accept': 'application/json' }
        });

        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const songs = await response.json();
        console.log('Hidden songs:', songs);

        if (Array.isArray(songs) && songs.length > 0) {
            container.innerHTML = songs.map(song => `
                <div class="recommendation-item" data-song-id="${song.id}">
                    <img src="${song.album_cover || '/images/default-album.png'}" 
                         alt="${song.title}" 
                         onerror="this.src='/images/default-album.png'"
                         class="song-cover">
                    <div class="song-info">
                        <div class="song-text">
                            <h3>${song.title}</h3>
                            <p>${song.artist}</p>
                            <p class="song-date">Hidden on: ${new Date(song.date || Date.now()).toLocaleDateString()}</p>
                        </div>
                        <audio controls class="preview-player" preload="none">
                            <source src="/api/preview?track=${encodeURIComponent(song.title)}&artist=${encodeURIComponent(song.artist)}" type="audio/mp3">
                        </audio>
                    </div>
                    <div class="song-controls">
                        <a href="https://open.spotify.com/track/${song.id}" 
                           target="_blank" 
                           class="spotify-button"
                           rel="noopener noreferrer">
                            <img src="/images/spotify-icon.png" alt="Spotify">
                            Open in Spotify
                        </a>
                        <button onclick="unhideSong('${song.id}', this)" 
                                class="unhide-button">
                            Unhide
                        </button>
                    </div>
                </div>
            `).join('');
        } else {
            container.innerHTML = '<p class="no-songs">No hidden songs</p>';
        }
    } catch (error) {
        console.error('Error loading hidden songs:', error);
        container.innerHTML = '<p class="error">Error loading songs</p>';
    }
};

window.toggleModal = function(modalId) {
    console.log('Toggle modal called for:', modalId);
    const modal = document.getElementById(modalId);
    
    if (!modal) {
        console.error(`Modal not found: ${modalId}`);
        return;
    }

    const isVisible = modal.classList.contains('show');
    console.log('Modal visibility:', isVisible);

    if (isVisible) {
        // Close modal
        modal.classList.remove('show');
        setTimeout(() => {
            modal.style.display = 'none';
            document.body.style.overflow = '';
        }, 300);
    } else {
        // Open modal
        document.querySelectorAll('.modal').forEach(m => {
            m.classList.remove('show');
            m.style.display = 'none';
        });
        
        modal.style.display = 'flex';
        requestAnimationFrame(() => {
            modal.classList.add('show');
            document.body.style.overflow = 'hidden';
        });

        // Load data if needed
        if (modalId === 'mySongsModal') {
            loadLikedSongs();
        } else if (modalId === 'hiddenSongsModal') {
            loadHiddenSongs();
        }
    }
};

// Auth functions
async function handleLogin(e) {
    e.preventDefault();
    
    try {
        const username = document.getElementById('loginUsername').value.trim();
        const password = document.getElementById('loginPassword').value;

        if (!username || !password) {
            alert('Please enter both username and password');
            return;
        }

        const response = await fetch('/api/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            credentials: 'include',
            body: JSON.stringify({ username, password })
        });

        const data = await response.json();

        if (data.success) {
            // Clear login form
            document.getElementById('loginForm').reset();
            
            // Close login modal
            toggleModal('loginModal');
            
            // Wait for modal to close
            await new Promise(resolve => setTimeout(resolve, 300));
            
            // Update UI and reload
            await checkLoginStatus();
            window.location.reload();
        } else {
            // Show specific error message
            alert(data.error || 'Login failed. Please try again.');
        }
    } catch (error) {
        console.error('Login error:', error);
        alert('Login failed. Please try again.');
    }
}

async function handleRegister(e) {
    e.preventDefault();
    
    try {
        const form = document.getElementById('registerForm');
        const formData = {
            username: form.querySelector('#regUsername').value.trim(),
            email: form.querySelector('#regEmail').value.trim(),
            password: form.querySelector('#regPassword').value,
            firstname: form.querySelector('#regFirstName').value.trim(),
            lastname: form.querySelector('#regLastName').value.trim(),
            dob: form.querySelector('#regDob').value,
            sex: form.querySelector('#regSex').value,
            country: form.querySelector('#regCountry').value
        };

        // Validate required fields
        const required = ['username', 'email', 'password', 'firstname', 'lastname'];
        if (required.some(field => !formData[field])) {
            alert('Please fill in all required fields');
            return;
        }

        const response = await fetch('/api/register', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify(formData)
        });

        const data = await response.json();

        if (data.success) {
            // Clear the form first
            form.reset();
            
            // Close registration modal
            const regModal = document.getElementById('registerModal');
            regModal.classList.remove('show');
            regModal.style.display = 'none';
            
            // Wait for modal to close
            await new Promise(resolve => setTimeout(resolve, 300));
            
            // Show success message
            alert('Registration successful! Please login.');
            
            // Open login modal
            toggleModal('loginModal');
        } else {
            // Handle specific error cases
            const errorMessages = {
                'username_taken': 'This username is already taken',
                'email_taken': 'This email is already registered',
                'database_error': 'An error occurred. Please try again',
                'unexpected_error': 'An unexpected error occurred'
            };
            
            alert(errorMessages[data.error] || data.error || 'Registration failed');
        }
    } catch (error) {
        console.error('Registration error:', error);
        alert('Registration failed. Please try again later.');
    }
}

async function checkLoginStatus() {
    try {
        const response = await fetch('/api/check_login', {
            credentials: 'include' // Add this line
        });
        
        if (!response.ok) throw new Error('Failed to check login status');
        
        const data = await response.json();
        const navButtons = document.getElementById('nav-buttons');
        const authButtons = document.getElementById('auth-buttons');
        
        if (data.logged_in) {
            navButtons.classList.remove('hidden');
            authButtons.classList.add('hidden');
        } else {
            navButtons.classList.add('hidden');
            authButtons.classList.remove('hidden');
        }
    } catch (error) {
        console.error('Error checking login status:', error);
    }
}

// Add this after the auth functions
window.logout = async function() {
    try {
        const response = await fetch('/api/logout', {
            method: 'POST',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (response.ok) {
            // Clear session and reload page
            sessionStorage.clear();
            localStorage.clear();
            window.location.href = '/';  // Redirect to home page
        } else {
            throw new Error('Logout failed');
        }
    } catch (error) {
        console.error('Logout error:', error);
        alert('Failed to logout. Please try again.');
    }
};

function setupPasswordValidation() {
    const passwordInput = document.getElementById('regPassword');
    const confirmInput = document.getElementById('regPasswordConfirm');
    const strengthBar = document.querySelector('.strength-bar');
    const strengthText = document.querySelector('.strength-text');
    const registerBtn = document.querySelector('#registerForm button[type="submit"]');

    function checkPasswordStrength(password) {
        let strength = 0;
        const patterns = [
            /[a-z]/, // lowercase
            /[A-Z]/, // uppercase
            /[0-9]/, // numbers
            /[^A-Za-z0-9]/, // special characters
            /.{8,}/ // minimum length
        ];

        patterns.forEach(pattern => {
            if (pattern.test(password)) strength++;
        });

        strengthBar.className = 'strength-bar';
        if (strength < 3) {
            strengthBar.classList.add('weak');
            strengthText.textContent = 'Weak password';
            return false;
        } else if (strength < 5) {
            strengthBar.classList.add('medium');
            strengthText.textContent = 'Medium strength password';
            return false;
        } else {
            strengthBar.classList.add('strong');
            strengthText.textContent = 'Strong password';
            return true;
        }
    }

    function validateForm() {
        const password = passwordInput.value;
        const confirm = confirmInput.value;
        const isStrong = checkPasswordStrength(password);
        const isMatch = password === confirm;
        registerBtn.disabled = !(isStrong && isMatch);
    }

    passwordInput.addEventListener('input', validateForm);
    confirmInput.addEventListener('input', validateForm);
}

// Updated Modal Handling
function setupModalHandlers() {
    // Close button handler
    document.querySelectorAll('.close-btn').forEach(btn => {
        btn.onclick = (e) => {
            e.preventDefault();
            const modal = btn.closest('.modal');
            if (modal) toggleModal(modal.id);
        };
    });

    // Close on outside click
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) toggleModal(modal.id);
        });
    });

    // Modal trigger buttons
    document.querySelectorAll('[data-modal]').forEach(button => {
        button.onclick = (e) => {
            e.preventDefault();
            toggleModal(button.getAttribute('data-modal'));
        };
    });

    // Initialize form handlers
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');

    if (loginForm) {
        loginForm.onsubmit = async (e) => {
            e.preventDefault();
            await handleLogin(e);
        };
    }

    if (registerForm) {
        registerForm.onsubmit = async (e) => {
            e.preventDefault();
            await handleRegister(e);
        };
    }
}

// Add this new function for country selection
async function initializeCountrySelector() {
    const countrySelect = document.getElementById('regCountry');
    try {
        const response = await fetch('https://restcountries.com/v3.1/all');
        const countries = await response.json();
        
        // Sort countries by name
        countries.sort((a, b) => a.name.common.localeCompare(b.name.common));
        
        // Add countries to select element
        countries.forEach(country => {
            const option = document.createElement('option');
            option.value = country.name.common;
            option.textContent = country.name.common;
            countrySelect.appendChild(option);
        });
    } catch (error) {
        console.error('Error loading countries:', error);
        countrySelect.innerHTML = '<option value="">Error loading countries</option>';
    }
}

// Click outside search to close suggestions
document.addEventListener('click', (e) => {
    const suggestionsDiv = document.getElementById('suggestions');
    const searchContainer = document.querySelector('.search-container');
    
    if (!searchContainer.contains(e.target)) {
        suggestionsDiv.style.display = 'none';
    }
});
