document.addEventListener('DOMContentLoaded', function() {
    console.log('App.js loaded successfully');
    
    // Test the search functionality
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        console.log('Search input found');
        searchInput.addEventListener('input', function(e) {
            console.log('Search input value:', e.target.value);
        });
    } else {
        console.log('Search input not found');
    }

    const suggestionsDiv = document.getElementById('suggestions');
    const resultsDiv = document.getElementById('results');
    
    // Create starfield effect
    const starfield = document.getElementById('starfield');
    for (let i = 0; i < 100; i++) {
        const star = document.createElement('div');
        star.className = 'star';
        star.style.left = Math.random() * 100 + '%';
        star.style.top = Math.random() * 100 + '%';
        star.style.animationDuration = (Math.random() * 3 + 2) + 's';
        starfield.appendChild(star);
    }

    // Handle search input - Updated version
    let timeoutId;
    searchInput.addEventListener('input', function(e) {
        clearTimeout(timeoutId);
        const query = e.target.value.trim();
        
        if (query.length < 3) {
            suggestionsDiv.style.display = 'none';
            return;
        }

        timeoutId = setTimeout(() => {
            fetch(`/api/search?q=${encodeURIComponent(query)}`)
                .then(response => response.json())
                .then(data => {
                    console.log('Search results:', data); // Debug log
                    suggestionsDiv.innerHTML = '';
                    if (data.length > 0) {
                        suggestionsDiv.style.display = 'block';
                        data.forEach(song => {
                            const div = document.createElement('div');
                            div.className = 'suggestion-item';
                            div.textContent = `${song.title} - ${song.artist}`;
                            div.onclick = () => showSongDetails(song);
                            suggestionsDiv.appendChild(div);
                        });
                    } else {
                        suggestionsDiv.style.display = 'none';
                    }
                })
                .catch(error => {
                    console.error('Search error:', error);
                    suggestionsDiv.style.display = 'none';
                });
        }, 300);
    });

    async function getPreviewUrl(title, artist) {
        try {
            const response = await fetch(`/api/preview?track=${encodeURIComponent(title)}&artist=${encodeURIComponent(artist)}`);
            const data = await response.json();
            return data.preview_url;
        } catch (error) {
            console.error('Error fetching preview:', error);
            return null;
        }
    }

    function showLoading() {
        document.getElementById('loadingOverlay').classList.add('active');
    }

    function hideLoading() {
        document.getElementById('loadingOverlay').classList.remove('active');
    }

    async function showSongDetails(song) {
        try {
            showLoading();
            suggestionsDiv.style.display = 'none';

            const recommendationsResponse = await fetch(`/api/recommendations?track=${encodeURIComponent(song.title)}&artist=${encodeURIComponent(song.artist)}`);
            const recommendations = await recommendationsResponse.json();
            
            resultsDiv.innerHTML = '';
            
            if (recommendations && recommendations.length > 0) {
                const recommendationsSection = document.createElement('div');
                recommendationsSection.className = 'recommendations-section';
                // Updated title to include the searched song name
                recommendationsSection.innerHTML = `<h2>Similar Songs to: ${song.title} - ${song.artist}</h2>`;
                
                const recommendationsList = document.createElement('div');
                recommendationsList.className = 'recommendations-list';
                
                const recommendationTemplate = document.getElementById('recommendation-template').innerHTML;
                for (const rec of recommendations) {
                    const previewUrl = await getPreviewUrl(rec.title, rec.artist);
                    const recItem = document.createElement('div');
                    recItem.innerHTML = eval('`' + recommendationTemplate + '`');
                    recommendationsList.appendChild(recItem.firstElementChild);
                }
                
                recommendationsSection.appendChild(recommendationsList);
                resultsDiv.appendChild(recommendationsSection);
            } else {
                resultsDiv.innerHTML = '<p class="no-recommendations">No recommendations found</p>';
            }

        } catch (error) {
            console.error('Error:', error);
            resultsDiv.innerHTML = '<p class="error">Error loading recommendations</p>';
        } finally {
            hideLoading();
            searchInput.value = `${song.title} - ${song.artist}`;
        }
    }

    function createSongCard(song, label = '') {
        const card = document.createElement('div');
        card.className = 'song-card';
        card.innerHTML = `
            ${label ? `<div class="song-label">${label}</div>` : ''}
            <img src="${song.image || 'placeholder.jpg'}" alt="${song.title}">
            <h3>${song.title}</h3>
            <p>${song.artist}</p>
            <div class="song-buttons">
                <button onclick="likeSong('${song.id}', '${song.title}', '${song.artist}', '${song.image}', this)" class="btn">Like</button>
                <button onclick="hideSong('${song.id}', '${song.title}', '${song.artist}', '${song.image}')" class="btn">Hide</button>
            </div>
        `;
        return card;
    }

    // Global functions for song actions
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
                    const parentModal = buttonElement.closest('#mySongsModal');
                    if (parentModal && songElement) {
                        songElement.remove();
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

    window.hideSong = async function(songId, title, artist, albumCover) {  // Added albumCover parameter
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
                body: JSON.stringify({
                    track_id: songId,
                    track_name: title,
                    artist_name: artist,
                    album_cover: albumCover  // Include album cover
                })
            });
    
            if (response.ok) {
                const songElement = document.querySelector(`[data-song-id="${songId}"]`);
                if (songElement) {
                    songElement.remove();
                    console.log('Song hidden');
                }
            } else {
                throw new Error('Failed to hide song');
            }
        } catch (error) {
            console.error('Error hiding song:', error);
            alert('Failed to hide song. Please try again.');
        }
    };

    window.logout = async function() {
        try {
            const response = await fetch('/api/logout', {
                method: 'POST',
                credentials: 'include'
            });
    
            if (response.ok) {
                location.reload();  // Refresh page after logout
            } else {
                throw new Error('Logout failed');
            }
        } catch (error) {
            console.error('Error logging out:', error);
            alert('Failed to logout. Please try again.');
        }
    };

    function isLoggedIn() {
        // Check if user is logged in
        return false; // Implement actual check
    }

    // Fix modal functionality
    window.toggleModal = function(modalId) {
        console.log('Toggle modal called for:', modalId);
        const modal = document.getElementById(modalId);
        
        if (!modal) {
            console.error(`Modal not found: ${modalId}`);
            return;
        }
    
        // If modal is already shown, hide it
        if (modal.classList.contains('show')) {
            document.body.style.overflow = '';
            modal.classList.remove('show');
            modal.style.display = 'none';
            return;
        }
    
        // Hide any other open modals
        document.querySelectorAll('.modal').forEach(m => {
            m.classList.remove('show');
            m.style.display = 'none';
        });
    
        // Show the modal
        modal.style.display = 'flex';
        setTimeout(() => {
            modal.classList.add('show');
            document.body.style.overflow = 'hidden';
        }, 10);
    
        // Load data if needed
        if (modalId === 'mySongsModal') {
            loadLikedSongs();
        } else if (modalId === 'hiddenSongsModal') {
            loadHiddenSongs();
        }
    };
    
    // Update modal event listeners
    document.addEventListener('DOMContentLoaded', function() {
        // Close button handler
        document.querySelectorAll('.close-btn').forEach(btn => {
            btn.onclick = function(e) {
                e.preventDefault();
                e.stopPropagation();
                const modal = this.closest('.modal');
                if (modal) {
                    toggleModal(modal.id);
                }
            };
        });
    
        // Close on click outside
        document.querySelectorAll('.modal').forEach(modal => {
            modal.onclick = function(e) {
                if (e.target === this) {
                    toggleModal(this.id);
                }
            };
        });
    
        // Close on escape key
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') {
                const visibleModal = document.querySelector('.modal.show');
                if (visibleModal) {
                    toggleModal(visibleModal.id);
                }
            }
        });
    });

    // Update event listeners
    document.addEventListener('DOMContentLoaded', function() {
        // Add button click handlers
        document.querySelectorAll('[data-modal]').forEach(button => {
            button.addEventListener('click', function(e) {
                e.preventDefault();
                const modalId = this.getAttribute('data-modal');
                toggleModal(modalId);
            });
        });
    
        // Close modal when clicking outside
        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', function(e) {
                if (e.target === this) {
                    toggleModal(modal.id);
                }
            });
        });
    
        // Close modal with escape key
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') {
                document.querySelectorAll('.modal.show').forEach(modal => {
                    toggleModal(modal.id);
                });
            }
        });
    
        // Add close button handlers
        document.querySelectorAll('.close-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                const modal = this.closest('.modal');
                if (modal) {
                    toggleModal(modal.id);
                }
            });
        });
    });

    // Handle login form
    document.getElementById('loginForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('loginUsername').value;
        const password = document.getElementById('loginPassword').value;

        try {
            const response = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });

            if (response.ok) {
                toggleModal('loginModal');
                location.reload();
            } else {
                alert('Invalid credentials');
            }
        } catch (error) {
            console.error('Login error:', error);
        }
    });

    // Handle register form
    document.getElementById('registerForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        // Get all required form values
        const formData = {
            username: document.getElementById('regUsername').value.trim(),
            email: document.getElementById('regEmail').value.trim(),
            password: document.getElementById('regPassword').value,
            firstname: document.getElementById('regFirstName').value.trim(),
            lastname: document.getElementById('regLastName').value.trim(),
            dob: document.getElementById('regDob').value,
            sex: document.getElementById('regSex').value,
            country: document.getElementById('regCountry').value
        };

        // Validate required fields
        const required = ['username', 'email', 'password', 'firstname', 'lastname'];
        const missing = required.filter(field => !formData[field]);
        
        if (missing.length > 0) {
            alert(`Please fill in all required fields: ${missing.join(', ')}`);
            return;
        }

        try {
            const response = await fetch('/api/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });

            const data = await response.json();

            if (response.ok) {
                alert('Registration successful! Please login.');
                toggleModal('registerModal');
                toggleModal('loginModal');
            } else {
                alert(data.error || 'Registration failed. Please try again.');
            }
        } catch (error) {
            console.error('Registration error:', error);
            alert('Registration failed. Please try again.');
        }
    });

    // Populate countries dropdown
    fetch('https://restcountries.com/v3.1/all')
        .then(response => response.json())
        .then(countries => {
            const countrySelect = document.getElementById('regCountry');
            countries
                .sort((a, b) => a.name.common.localeCompare(b.name.common))
                .forEach(country => {
                    const option = document.createElement('option');
                    option.value = country.name.common;
                    option.textContent = country.name.common;
                    countrySelect.appendChild(option);
                });
        });

    // Password strength checker
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

    // Call checkLoginStatus when page loads
    checkLoginStatus();
});

// Update the button click handlers to be more direct
document.addEventListener('DOMContentLoaded', function() {
    // Add direct click handlers to the nav buttons
    const mySongsBtn = document.querySelector('[data-modal="mySongsModal"]');
    const hiddenSongsBtn = document.querySelector('[data-modal="hiddenSongsModal"]');

    if (mySongsBtn) {
        mySongsBtn.onclick = async function(e) {
            e.preventDefault();
            console.log('My Songs button clicked');
            
            // Check login status first
            const loginCheck = await fetch('/api/check_login');
            const loginStatus = await loginCheck.json();
            
            if (!loginStatus.logged_in) {
                console.log('User not logged in');
                alert('Please log in to view your songs');
                toggleModal('loginModal');
                return;
            }

            console.log('Loading My Songs modal');
            toggleModal('mySongsModal');
        };
    }

    if (hiddenSongsBtn) {
        hiddenSongsBtn.onclick = async function(e) {
            e.preventDefault();
            console.log('Hidden Songs button clicked');
            
            // Check login status first
            const loginCheck = await fetch('/api/check_login');
            const loginStatus = await loginCheck.json();
            
            if (!loginStatus.logged_in) {
                console.log('User not logged in');
                alert('Please log in to view hidden songs');
                toggleModal('loginModal');
                return;
            }

            console.log('Loading Hidden Songs modal');
            toggleModal('hiddenSongsModal');
        };
    }

    // Update the loadLikedSongs function
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
    
    // Update the loadHiddenSongs function similarly
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
});

// Single, correct version of loadLikedSongs
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

// Single, correct version of loadHiddenSongs
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

// Add unhide song function
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

// Check login status and show/hide buttons
async function checkLoginStatus() {
    try {
        const response = await fetch('/api/check_login');
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

// Updated modal toggle function
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

// Updated loadLikedSongs function with enhanced display
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
                            <p class="song-date">Liked on: ${new Date(song.saved_at).toLocaleDateString()}</p>
                        </div>
                        <div class="preview-container">
                            <audio controls class="preview-player">
                                <source src="/deezer_preview?track=${encodeURIComponent(song.track_name)}&artist=${encodeURIComponent(song.artist_name)}" type="audio/mp3">
                            </audio>
                        </div>
                    </div>
                    <div class="song-controls">
                        <button onclick="likeSong('${song.track_id}', '${song.track_name}', '${song.artist_name}', '${song.album_cover}', this)" 
                                class="icon-button">
                            <img src="/images/like-icon-liked.png" 
                                 alt="Unlike" 
                                 data-liked="true">
                        </button>
                        <button onclick="hideSong('${song.track_id}', '${song.track_name}', '${song.artist_name}', '${song.album_cover}')" 
                                class="icon-button">
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

// Updated loadHiddenSongs function with enhanced display
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
                            <p class="song-date">Hidden on: ${new Date(song.date).toLocaleDateString()}</p>
                        </div>
                        <div class="preview-container">
                            <audio controls class="preview-player">
                                <source src="/deezer_preview?track=${encodeURIComponent(song.title)}&artist=${encodeURIComponent(song.artist)}" type="audio/mp3">
                            </audio>
                        </div>
                    </div>
                    <div class="song-controls">
                        <button onclick="unhideSong('${song.id}', this)" class="unhide-button">
                            <img src="/images/unhide-icon.png" alt="Unhide">
                            Unhide
                        </button>
                        <a href="https://open.spotify.com/track/${song.id}" 
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
            container.innerHTML = '<p class="no-songs">No hidden songs</p>';
        }
    } catch (error) {
        console.error('Error loading hidden songs:', error);
        container.innerHTML = '<p class="error">Error loading songs</p>';
    }
};
