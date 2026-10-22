---
title: "How to play Connect 4: rules, setup and first strategies"
description: "Learn Connect 4 in five minutes: the 7×6 board, how discs fall, what counts as four in a row, draws, beginner tips and how our four AI levels play."
pubDate: 2026-09-15
game: connect4
tags: ["connect-4", "rules", "beginners"]
hero: /blog/heroes/how-to-play-connect-4.png
heroAlt: "Illustrated hero image for How to play Connect 4: rules, setup and first strategies"
---

Connect 4 is one of those rare games that a six-year-old can learn in a single round and a mathematician can still argue about decades later. You drop discs, they fall, and the first player to line up four wins. That is the whole game. What makes it worth a guide is everything that sits underneath: gravity turns a simple noughts-and-crosses idea into a puzzle about timing, columns and who runs out of safe moves first.

This guide covers the rules exactly as our version plays them, then gives you enough strategy to stop losing to your little brother.

## What you need

Nothing beyond a browser. Connect 4 is a two-player game, so you need one opponent: a friend online, a family member on the sofa or one of our four AI opponents. A round typically lasts five minutes, which makes it ideal for filling the gap while dinner cooks or settling who does the washing-up.

## Setup

The board is a vertical grid with **seven columns and six rows**, giving 42 spaces. It starts empty. One player takes the red discs and the other takes yellow. In our game, the player with red discs moves first; when you play online the seats are assigned when the room starts, and when you play against the AI you can take either colour.

Because the board stands upright, discs do not go where you point. You choose a *column*, and the disc slides down until it rests on the bottom or on top of the highest disc already in that column. You cannot place a disc into mid-air, and you cannot place one into a column that is already full to the top.

## How a turn works

A turn is one action: pick a column that still has room and drop a disc. On a phone or tablet, tap the column; on a desktop, click or use the keyboard. The disc animates down to the lowest free space and the turn passes to your opponent. There is no passing and no undo once the disc has landed, so hover for a second before committing.

After every drop the game checks all the lines running through the disc that just landed. If any of them contains four discs of the same colour, that player wins immediately and the winning four is highlighted. If not, play continues.

## All the rules

1. **Players alternate turns**, dropping one disc per turn into any of the seven columns that is not full.
2. **Gravity applies.** The disc always falls to the lowest empty space in the column you chose.
3. **Four in a row wins.** The line can be horizontal (along a row), vertical (up a column) or diagonal (in either direction). The four discs must be adjacent, with no gaps and no opposing discs in between.
4. **A full board with no four is a draw.** With 42 spaces and alternating turns, red places 21 discs and yellow places 21. If nobody has connected four by then, the game ends level.

That really is everything. There are no special pieces, no dice and no cards, which is why the strategy is so clean.

## Strategy tips for your first games

### Take the centre column

Every winning line of four must pass through *some* cells, and the cells in the middle column sit on more possible lines than any other. A disc in the central column is part of 7 to 13 potential lines depending on its height; a disc in an edge column is part of 3 to 5. If the centre is open on your first move, take it. If your opponent takes it, play next to it.

### Count to three

Before every move, scan for any three of your opponent's discs in a line with a *playable* empty fourth cell. "Playable" matters: a gap that floats above an empty space cannot be filled this turn, so it is not an emergency yet. If a three is completable right now, block it. Then look for your own.

### Think about what your move enables

The most common beginner blunder is dropping a disc that raises the column so the opponent can land exactly where they wanted. Before you play, look at the cell directly above your intended spot and ask whether it completes a line for them.

### Build on two levels

Threats that sit one above the other in the same column are powerful: whoever is forced to fill the lower one hands the upper one to the other player. Later guides explain the odd-and-even logic behind this, but you can start noticing stacked threats immediately.

## Common mistakes

- **Playing the edges early.** Edge columns offer the fewest lines and make it easy for your opponent to seize the middle.
- **Blocking a three that is not yet playable.** Sometimes that disc is wasted, and worse, it may lift the column into a spot the opponent wanted.
- **Chasing verticals.** A vertical four is easy to see and easy to block: your opponent just drops one disc on top. Verticals are useful as *threats that force a reply*, not as winning plans.
- **Ignoring diagonals.** Most surprise losses come from a diagonal that nobody noticed forming across four columns.

## Playing with friends and family

Choose **Online Multiplayer** on the game page and matchmaking pairs you with another player looking for Connect 4; the room begins as soon as both seats are filled, or after a short wait once enough players have joined. If you would rather play a specific person, create a **private room** and ping a friend from your friends list. While you play you can use the text chat, send quick emotes or switch on **voice chat**, which is where Connect 4 gets fun: the groaning when a diagonal appears is half the entertainment.

On a shared screen at home, simply pass the device between turns. Because a round is so short, Connect 4 works well as a tournament: best of five, loser rotates out.

## Choosing an AI level

![The four AI levels, from Buddy to Oracle](/blog/ai-levels.svg)

Our four AI opponents share one engine but differ in how often they deliberately play a random legal move.

- **Buddy** plays casually and makes mistakes most of the time. Perfect for young children or for learning the rules without pressure.
- **Nova** plays a sensible move more often than not. Expect to be punished for leaving an open three.
- **Titan** rarely slips. You will need to think about stacked threats and column parity to win.
- **Oracle** never plays a random move and searches deeply.

One honest note: Connect 4 is a **solved game**. In 1988 it was proven that the first player wins with perfect play by starting in the centre column, and that starting in any other column lets the second player draw or win. The Oracle does not use a full solution table, but it plays very strongly, and if it moves first and opens in the centre you should be happy with any result that is not a quick loss. Play red yourself and open in the middle to give yourself the theoretical edge.

## Quick reference

| Topic | Rule |
| --- | --- |
| Board | 7 columns × 6 rows (42 cells) |
| Players | 2 (red and yellow) |
| First move | Red |
| Turn | Drop one disc into a non-full column |
| Disc placement | Falls to the lowest empty cell in that column |
| Win | Four adjacent same-colour discs: horizontal, vertical or diagonal |
| Draw | All 42 cells filled with no four in a row |
| Typical length | About 5 minutes |
| AI opponents | Buddy, Nova, Titan, Oracle |

## Image guide

![A Connect 4 board with red and yellow discs and a green-circled winning diagonal](/blog/connect4-board.svg)

The board is taller than it looks: six rows means a vertical four needs four uninterrupted drops in one column, while a diagonal like this one spans four columns and four rows at once.

![Heat map showing how many winning lines pass through each cell on the Connect 4 board](/blog/connect4-centre.svg)

The numbers count every possible four-in-a-row line passing through each cell. The centre column totals 60 lines; each edge column totals only 24, which is why the middle matters.

## References

- [Connect Four on Wikipedia](https://en.wikipedia.org/wiki/Connect_Four), including the history of the 1988 solution
- [Solved game on Wikipedia](https://en.wikipedia.org/wiki/Solved_game), which explains what "solved" means for games like this
- [John Tromp's Connect 4 research page](https://tromp.github.io/c4/c4.html), with the full first-player-win analysis

## Play it now

Open [Connect 4](/games/connect-4), pick a colour and drop your first disc in the centre. When you are ready for the deeper ideas, read our guide to [controlling the centre and counting threats](/blog/connect-4-strategy-centre-and-threats).
