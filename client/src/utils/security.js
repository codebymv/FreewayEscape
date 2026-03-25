// Prevent certain keyboard shortcuts and context menu
document.addEventListener('keydown', function(event) {
    // Prevent Ctrl + Key combinations and F12
    if (event.ctrlKey || event.keyCode == 123) {
        event.preventDefault();
        event.stopPropagation();
    }
});

// Prevent right-click context menu
document.addEventListener('contextmenu', function(event) {
    event.preventDefault();
}, false);
