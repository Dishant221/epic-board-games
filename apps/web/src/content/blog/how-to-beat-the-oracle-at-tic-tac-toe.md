---
title: "How to beat the Oracle at Tic Tac Toe (and why you can only draw)"
description: "The Oracle plays Tic Tac Toe perfectly, so the best you can do is draw. Learn the drawing recipe as X and O, plus the traps that beat Buddy, Nova and Titan."
pubDate: 2026-10-12
game: tic_tac_toe
tags: ["tic-tac-toe", "strategy", "ai"]
hero: /blog/heroes/how-to-beat-the-oracle-at-tic-tac-toe.png
heroAlt: "Illustrated hero image for How to beat the Oracle at Tic Tac Toe (and why you can only draw)"
---

Let us get the awkward part out of the way. You cannot beat the Oracle at Tic Tac Toe. Nobody can. The Oracle is our highest AI level, it never plays a random move, and Tic Tac Toe is a game in which perfect play from both sides always ends in a draw. Against a perfect opponent, the best result available to you is to never lose.

The good news is that *you* can play perfectly too. The game is small enough that a complete strategy fits in eight lines, and once you know it you will draw the Oracle every single time and beat the three lower levels whenever they slip. This guide gives you the full recipe.

If you need the rules first, read [How to play Tic Tac Toe](/blog/how-to-play-tic-tac-toe).

## Why perfect play is a draw

With nine squares and eight winning lines, every possible game has been examined. There are 255,168 distinct move sequences and only 765 distinct positions after rotations and reflections are removed. Every one of them has been checked, and in every line where both players make the best move, the board fills with no three in a row.

That means the Oracle's job is easy: it never makes the one mistake in each position that would let you win. Your job is identical. Think of it less as "beating" and more as a duel where the first person to blink loses, and the Oracle does not blink.

## The priority list

![Ranked list of the eight Tic Tac Toe move priorities](/blog/ttt-priority-list.svg)

This is the classic perfect-play strategy, first written down by Allen Newell and Herbert Simon in the early 1970s. On every turn, go down the list and play the first rule that applies.

1. **Win.** If you have two in a line with the third square empty, take it.
2. **Block.** If your opponent has two in a line with the third square empty, take it.
3. **Fork.** If you can make a move that creates two winning threats at once, do it.
4. **Block a fork.** If your opponent could fork next move, either make a two-in-a-row that forces them to block somewhere harmless, or occupy the fork square directly. Never force them into a block that gives them a fork.
5. **Centre.** Take the middle if it is free.
6. **Opposite corner.** If the opponent is in a corner, take the corner diagonally opposite.
7. **Empty corner.** Take any free corner.
8. **Empty side.** Take any free edge square.

Follow this and you cannot lose. Rules 1 and 2 handle immediate tactics; rules 3 and 4 handle forks, the only way anyone ever wins; rules 5 to 8 choose a sensible quiet move when nothing is forced.

## The drawing recipe as X

You move first. Open in a **corner**.

![Three replies to a corner opening: centre holds the draw, corner and edge replies lose to forks](/blog/ttt-opening-replies.svg)

- **Oracle takes the centre** (it always will). Now take the **opposite corner**. The Oracle must take one of the two remaining corners or an edge; whichever it plays, you block any line it threatens, and the game fills to a draw. Do not take a third corner here: with O in the centre, that gives O a two-in-a-row that forces you around the board.
- **Opponent takes a corner instead** (a mistake Buddy and Nova make). Take another corner so that you have two corners not on the same side as O's reply, then one more corner next turn creates a fork. You win.
- **Opponent takes an edge** (also a mistake). Take the centre. Now you threaten a diagonal, O must block in the far corner, and you can set up a fork in the remaining corners. You win.

The corner opening is strongest precisely because it leaves O exactly one good reply. Against the Oracle it draws; against the others it wins more often than any other opening.

## The drawing recipe as O

You move second, and X has three kinds of opening.

- **X takes a corner.** Take the **centre**. This is the only move. Then block every two-in-a-row X makes, and if X plays the opposite corner, answer with an **edge**, not a corner; a corner reply hands X a fork.
- **X takes the centre.** Take a **corner**. Edges lose here. From then on, block each threat as it appears. If X takes the corner opposite yours, take any remaining corner; the position fills to a draw.
- **X takes an edge.** Take the **centre**, or either corner adjacent to X's edge. Then block as needed. Edge openings are weak and you may even get a chance to fork if X goes wrong.

One subtle point: as O you will sometimes face a position with X in two opposite corners and you in the centre. The natural-looking corner reply loses to a fork. Play an **edge**. X is forced to block, and the game draws.

## Traps that beat Buddy, Nova and Titan

![A Tic Tac Toe position where X threatens two lines at once](/blog/ttt-fork.svg)

The lower AI levels differ from the Oracle in one way only: they sometimes play a random legal move instead of the best one. Buddy does this most of the time, Nova less than half the time, Titan only occasionally. When a random move lands, these traps punish it.

### The corner-corner fork

Open in a corner. If the opponent replies anywhere other than the centre, take the opposite corner. If they still do not take the centre, take a third corner: you now threaten two lines and win next move. If they do take the centre at that point, you have two opposite corners against a centre; block their threat and the game draws, but you lost nothing.

### The edge-reply fork

Open in a corner. If the opponent answers on an edge adjacent to your corner, take the centre. You threaten the diagonal; they must block the far corner. Now take the corner on the far end of the row that contains their edge piece... and wherever they block, you have another line waiting.

Titan slips rarely, so expect a long run of draws with the odd win. That is the correct result against a strong opponent and a good sign your own play is sound.

## Using the Oracle as a teaching tool

For children, the Oracle is a patient coach. It never gloats, never gets bored and never lets a fork through, which means every loss a child suffers against it points at a specific missed rule from the list. Try this routine:

1. Start on **Buddy** and let the child win a few games to learn what a line looks like.
2. Move to **Nova** and introduce the word *block*.
3. Move to **Titan** and introduce *fork*: "can you make two threats at once?"
4. Finish on the **Oracle** and make the goal explicit: "we are trying to draw." Reframing a draw as a success is one of the best lessons the game teaches.

## Quick reference

| Situation | Correct move |
| --- | --- |
| You can complete a line | Win |
| Opponent can complete a line | Block |
| You can create two threats | Fork |
| Opponent threatens a fork | Force a harmless block or take the fork square |
| Nothing forced, centre free | Centre |
| Opponent in a corner | Opposite corner |
| Otherwise | Any corner, then any edge |
| Opening as X | Corner |
| Reply to a corner as O | Centre, always |
| Reply to the centre as O | Corner, never an edge |
| X in two opposite corners, you in centre | Edge, never a corner |
| Expected result versus Oracle | Draw, every time |

## Image guide

![Ranked list of the eight Tic Tac Toe move priorities](/blog/ttt-priority-list.svg)

Run down the list every turn and play the first rule that applies. It is the complete strategy for the game.

![Three replies to a corner opening: centre holds the draw, corner and edge replies lose to forks](/blog/ttt-opening-replies.svg)

The corner opening leaves O exactly one safe reply. The Oracle always finds it; the other levels sometimes do not.

![A Tic Tac Toe position where X threatens two lines at once](/blog/ttt-fork.svg)

Every win in Tic Tac Toe between players who block single threats comes from a fork like this one.

## References

- [Tic-tac-toe on Wikipedia](https://en.wikipedia.org/wiki/Tic-tac-toe), including the Newell and Simon strategy
- [Solved game on Wikipedia](https://en.wikipedia.org/wiki/Solved_game), explaining why a forced draw means neither side can win
- [Herbert A. Simon on Wikipedia](https://en.wikipedia.org/wiki/Herbert_A._Simon), one of the authors of the original program that played the game perfectly

## Play it now

Open [Tic Tac Toe](/games/tic-tac-toe), select the Oracle, open in a corner and hold the draw. Then drop down to Titan and go hunting for forks.
