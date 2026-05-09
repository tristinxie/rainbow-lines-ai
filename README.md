# Rainbow Lines AI

A browser version of the classic Color Lines puzzle, with an AI player that takes over the board and plays for you.

> **Disclaimer:** This project is just me experimenting with full on AI-assisted coding. Don't take it too seriously — it's a sandbox, not a polished product.

## Play

[www.tristinxie.com/rainbow-lines-ai](https://tristinxie.github.io/rainbow-lines-ai)

## About

Color Lines is a 9×9 grid puzzle. Balls of seven colors appear at random; you move one ball per turn through any empty path, and lines of five or more same-colored balls (horizontal, vertical, or diagonal) clear and score points. After every non-scoring move, three new random balls drop. The game ends when the board fills.

## How to play

- Click a ball to select it (it will squish in place)
- Click an empty cell to move the selected ball there
- Form 5+ same-colored balls in a line to clear them and score
- Longer lines score exponentially more (`count² × 2`)
- Click the selected ball again to deselect

## Features

- **AI Play** — hands the game to a heuristic AI that plays until game over
- **Fast Mode** — removes the delay between AI moves so it tears through the board
- **Best score** persists across sessions via `localStorage`
- **Responsive layout** — works on phones (the 9×9 board scales to fit any viewport)

## Tech

Single-page, vanilla HTML / CSS / JavaScript. No frameworks, no build step, no dependencies. Just open `index.html` in a browser.

```
rainbow-lines-ai/
├── index.html      structure
├── styles.css      all styling
├── game.js         game logic + AI
└── README.md       this file
```

## AI strategy

The AI uses a greedy 1-ply search with sliding-window evaluation and Monte Carlo spawn sampling:

- For every legal move (every reachable empty cell from every ball), simulate the move on a cloned grid
- If the move scores immediately, take it (highest matched-line count wins)
- Otherwise, evaluate the resulting board with a sliding 5-cell window scorer that rewards single-color clusters proportionally to their length and ignores any window blocked by mixed colors
- Average across 25 random spawn placements of the next 3 known colors to estimate post-spawn board quality
- Pick the move with the highest expected value

It cannot play indefinitely — the random spawn placement guarantees an eventual loss — but it scores well above casual human play.
