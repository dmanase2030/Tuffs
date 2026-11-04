# SudokuFlow

**SudokuFlow** is a premium, Notion-inspired Sudoku workspace designed for clarity, depth, and a seamless solving experience. Built entirely with pure HTML, CSS, and JavaScript, it offers a high-performance, framework-free environment that works perfectly offline and across all modern devices. Whether you are a beginner looking to learn the basics or an expert tackling insane challenges, SudokuFlow provides the tools, analytics, and game modes to elevate your play.

## Key Features

SudokuFlow is packed with features that cater to every type of player, from casual solvers to competitive enthusiasts.

| Feature Category | Description |
| :--- | :--- |
| **Game Modes** | Includes Classic, Timed Rush (10-minute countdown), Zen Mode (untimed), Hardcore (3 mistakes and you're out), and Daily Challenges. |
| **Smart Hints** | A multi-level hint system that can suggest candidates, explain logical techniques, or reveal the next move. |
| **Live Analytics** | Real-time tracking of accuracy, completion percentage, current streak, and historical best times. |
| **Notion-Inspired UI** | A clean, minimalist aesthetic with support for multiple themes including Notion Light, Dark, and high-contrast modes. |
| **Custom Puzzles** | Load any puzzle via a string or share your own progress with unique, solvable URLs. |
| **Learn Module** | Built-in tutorials for advanced techniques like Naked Singles, Hidden Pairs, X-Wing, and Swordfish. |

## Getting Started

Since SudokuFlow is built with standard web technologies, there is no complex build process or installation required.

### Prerequisites

You only need a modern web browser (Chrome, Firefox, Safari, or Edge).

### Installation

1. Clone the repository to your local machine:
   ```bash
   git clone https://github.com/vincenzo-afk/sudokuflow.git
   ```
2. Navigate into the project directory:
   ```bash
   cd sudokuflow
   ```
3. Open `index.html` in your browser:
   ```bash
   # On macOS
   open index.html
   # On Linux
   xdg-open index.html
   # Or simply drag and drop the file into your browser window
   ```

## Development and Testing

SudokuFlow includes a comprehensive test suite to ensure the integrity of the puzzle generation and solving logic.

### Running Tests

The project uses Node.js for headless logic testing and Playwright for end-to-end UI verification.

1. Install dependencies:
   ```bash
   npm install
   ```
2. Run core logic tests:
   ```bash
   npm run test:logic
   ```
3. Run UI and browser interaction tests:
   ```bash
   npm run test:ui
   ```

## Technical Architecture

The project follows a modular, event-driven architecture that prioritizes performance and state consistency.

*   **State Management:** A centralized `gameState` object tracks the board, history, timer, and active settings.
*   **Puzzle Engine:** A deterministic backtracking algorithm handles puzzle generation, ensuring every board has exactly one unique solution.
*   **Persistence:** `localStorage` is used to save game progress, user statistics, and preferences across sessions.
*   **Themes:** CSS variables are utilized to provide instant theme switching without page reloads.

## Contributing

We welcome contributions to SudokuFlow! Whether it is fixing a bug, adding a new feature, or improving the documentation, please feel free to open a Pull Request.

1. Fork the repository.
2. Create your feature branch (`git checkout -b feature/AmazingFeature`).
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`).
4. Push to the branch (`git push origin feature/AmazingFeature`).
5. Open a Pull Request.

## License

Distributed under the MIT License. See `LICENSE` for more information.

## Acknowledgments

*   Inspired by the minimalist design language of Notion.
*   Built for the Sudoku community.
*   Special thanks to all contributors and testers.
