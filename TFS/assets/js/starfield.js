
document.addEventListener('DOMContentLoaded', function() {
    const starfield = document.getElementById('starfield');
    const numberOfStars = 200; // Increase number of stars
    
    // Create stars
    for (let i = 0; i < numberOfStars; i++) {
        const star = document.createElement('div');
        star.className = 'star';
        
        // Random position
        star.style.left = `${Math.random() * 100}%`;
        star.style.top = `${Math.random() * 100}%`;
        
        // Random size between 1-3px
        const size = Math.random() * 2 + 1;
        star.style.width = `${size}px`;
        star.style.height = `${size}px`;
        
        // Random animation duration between 3-8 seconds
        star.style.animationDuration = `${Math.random() * 5 + 3}s`;
        
        // Random animation delay
        star.style.animationDelay = `${Math.random() * 8}s`;
        
        starfield.appendChild(star);
    }
});
