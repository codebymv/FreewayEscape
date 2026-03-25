import Game from './core/game.js';
import './utils/security.js';

class SinglePlayerClient {
  constructor() {
    this.gameState = {
      gameMode: 'menu' // 'menu', 'racing'
    };
    this.game = null;
    this.setupEventListeners();
    this.showGameMenu();
  }

  setupEventListeners() {
    // Use event delegation for dynamically created elements
    document.addEventListener('click', (e) => {
      if (e.target.classList.contains('back-to-menu')) {
        this.showGameMenu();
      } else if (e.target.id === 'resume-game-btn') {
        this.resumeGame();
      } else if (e.target.id === 'back-to-main-menu-btn') {
        this.backToMainMenu();
      }
    });

    // Add escape key handler for pause menu
    document.addEventListener('keydown', (e) => {
      if (e.code === 'Escape') {
        const pauseMenu = document.getElementById('pause-menu');
        // If pause menu visible, resume; otherwise pause if game is active
        if (pauseMenu && pauseMenu.style.display === 'flex') {
          this.resumeGame();
        } else if (this.game && this.game.inGame && !this.game.isPaused) {
          this.showPauseMenu();
        }
      }
    });

    // Add hover effects for buttons
    document.addEventListener('mouseenter', (e) => {
      if (e.target && e.target.matches && e.target.matches('#main-menu button, #pause-menu button')) {
        e.target.style.transform = 'translateY(-3px)';
      }
    }, true);
    
    document.addEventListener('mouseleave', (e) => {
      if (e.target && e.target.matches && e.target.matches('#main-menu button, #pause-menu button')) {
        e.target.style.transform = 'translateY(0)';
      }
    }, true);
  }

  showGameMenu() {
    this.gameState.gameMode = 'menu';
    this.hideAllScreens();
    
    // Create main menu if it doesn't exist
    if (!document.getElementById('main-menu')) {
      this.createMainMenu();
    }
    
    // Stop any music when returning to main menu - main menu should be silent
    if (this.game && this.game.audio && this.game.audio.initialized) {
      this.game.audio.stopMusic();
    }
    
    document.getElementById('main-menu').style.display = 'flex';

    // Ensure the game and level select are visible beneath the logo
    if (!this.game) {
      this.game = new Game();
    } else {
      this.game.reset();
    }
    const gameEl = document.getElementById('game');
    if (gameEl) gameEl.style.display = 'block';
    this.game.showLevelSelect();
  }

  createMainMenu() {
    const menuHTML = `
      <div id="main-menu" style="
        position: fixed;
        top: 20px;
        left: 0;
        width: 100vw;
        height: auto;
        background: transparent;
        display: flex;
        flex-direction: column;
        justify-content: flex-start;
        align-items: center;
        z-index: 3000;
        font-family: 'Press Start 2P', cursive;
        color: white;
        pointer-events: none;
      ">
        <img src="images/logo.png" alt="Freeway Escape" style="
          height: 140px;
          image-rendering: pixelated;
          filter: drop-shadow(0 0 6px rgba(0,0,0,0.6)) drop-shadow(0 0 12px rgba(255,0,255,0.5));
          margin-bottom: 16px;
        "/>
      </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', menuHTML);
  }

  startSinglePlayer() {
    this.hideAllScreens();
    this.gameState.gameMode = 'racing';
    
    // Initialize the original game
    if (!this.game) {
      this.game = new Game();
    } else {
      // If game already exists, reset it
      this.game.reset();
    }
    
    // Show game elements
    document.getElementById('game').style.display = 'block';
    
    // Go straight to level select to skip the grey box glitch
    this.game.showLevelSelect();
  }

  hideAllScreens() {
    const screens = ['main-menu', 'game'];
    screens.forEach(id => {
      const element = document.getElementById(id);
      if (element) {
        element.style.display = 'none';
      }
    });
  }

  showPauseMenu() {
    // Create pause menu if it doesn't exist
    if (!document.getElementById('pause-menu')) {
      this.createPauseMenu();
    }
    
    // Show pause menu
    document.getElementById('pause-menu').style.display = 'flex';
    
    // Pause the game
    if (this.game && this.game.inGame) {
      this.game.pause();
    }
  }

  createPauseMenu() {
    const pauseMenuHTML = `
      <div id="pause-menu" style="
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        background: rgba(0, 0, 0, 0.8);
        display: none;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        z-index: 2000;
        font-family: 'Press Start 2P', cursive;
        color: white;
      ">
        <div style="
          background: rgba(255, 255, 255, 0.1);
          backdrop-filter: blur(10px);
          border-radius: 15px;
          padding: 40px;
          border: 2px solid rgba(255, 255, 255, 0.2);
          text-align: center;
        ">
          <h2 style="margin-bottom: 40px; color: #4ecdc4; font-size: 24px;">
            ⏸️ GAME PAUSED
          </h2>
          
          <div style="display: flex; flex-direction: column; gap: 20px;">
            <button id="resume-game-btn" style="
              padding: 15px 30px;
              font-family: 'Press Start 2P', cursive;
              font-size: 14px;
              background: linear-gradient(45deg, #4ecdc4, #44a08d);
              color: white;
              border: none;
              border-radius: 8px;
              cursor: pointer;
              transition: transform 0.2s;
            ">🎮 RESUME GAME</button>
            
            <button id="back-to-main-menu-btn" style="
              padding: 15px 30px;
              font-family: 'Press Start 2P', cursive;
              font-size: 14px;
              background: linear-gradient(45deg, #ff6b6b, #ee5a5a);
              color: white;
              border: none;
              border-radius: 8px;
              cursor: pointer;
              transition: transform 0.2s;
            ">🏠 BACK TO MENU</button>
          </div>
          
          <div style="margin-top: 30px; font-size: 10px; opacity: 0.7;">
            Press ESC to resume
          </div>
        </div>
      </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', pauseMenuHTML);
  }

  resumeGame() {
    const pauseMenu = document.getElementById('pause-menu');
    if (pauseMenu) {
      pauseMenu.style.display = 'none';
    }
    // Resume the game
    if (this.game && this.game.isPaused) {
      this.game.resume();
    }
  }

  backToMainMenu() {
    // Hide pause menu
    const pauseMenu = document.getElementById('pause-menu');
    if (pauseMenu) {
      pauseMenu.style.display = 'none';
    }
    
    // Resume the game first (in case it was paused)
    if (this.game && this.game.isPaused) {
      this.game.resume();
    }
    
    // Reset game state
    this.gameState.gameMode = 'menu';
    
    // Stop the game and hide game elements
    if (this.game) {
      this.game.inGame = false;
      this.game.reset();
    }
    
    // Show main menu
    this.showGameMenu();
  }
}

// Initialize the single-player client when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  // Start the single-player client
  const singlePlayerClient = new SinglePlayerClient();
  // Show menu with logo and level select immediately
  singlePlayerClient.showGameMenu();
});
