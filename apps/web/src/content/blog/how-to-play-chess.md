---
title: "How to play Chess: every rule from setup to checkmate"
description: "Learn chess from scratch: board setup, how each piece moves, castling, en passant, promotion, check and checkmate, every draw rule and how our AI levels play."
pubDate: 2026-09-08
game: chess
tags: ["chess", "rules", "beginners"]
hero: /blog/heroes/how-to-play-chess.png
heroAlt: "Illustrated hero image for How to play Chess: every rule from setup to checkmate"
---

Chess has a reputation for being hard, but the rules fit on one page. What takes a lifetime is getting good at it, and that is exactly why people keep coming back. This guide walks through everything you need for your first full game on Epic Board Games: how to set up the board, how every piece moves, the three special moves that trip up beginners, how games end, and how to pick an AI opponent that matches your level.

## What you need

Nothing but a browser. Chess on Epic Board Games is a full-rules implementation for two players: you can sit down against one of four AI opponents, match with a stranger online, or open a private room for a friend. The board rotates so you always see your own pieces at the bottom, legal squares light up when you pick up a piece, and the game will not let you make an illegal move, so you can learn by trying things.

## Setup

The board is an 8×8 grid of alternating light and dark squares. Two conventions tell you if you have it the right way round:

- **"White on the right."** Each player should have a light square in their bottom-right corner.
- **"Queen on her colour."** The white queen starts on a light square (d1) and the black queen on a dark square (d8). The kings go beside them on the e-file.

From the outside in, the back rank holds rook, knight, bishop, then queen and king, then bishop, knight, rook. The eight pawns line up in front. Squares are named by file (a–h, left to right from White's side) and rank (1–8, from White's side), so the white king begins on e1 and the black king on e8. Our board draws these coordinates in the margins because almost every chess resource uses them.

## How a turn works

White always moves first and the players then alternate, one move each. You must move on your turn; there is no passing. Pick up a piece, drop it on a legal square, and if an enemy piece is standing there it is captured and removed. That is the entire rhythm of the game. Everything else is detail about which squares count as legal.

## All the rules

### How each piece moves

- **Pawn.** Moves one square straight forward onto an empty square. On its very first move it may go two squares instead, provided both are empty. It captures differently: one square diagonally forward. Pawns never move backwards.
- **Knight.** Jumps in an L shape: two squares in one direction, then one square at right angles. It is the only piece that may leap over others, and it always lands on a square of the opposite colour to the one it left.
- **Bishop.** Any number of squares diagonally until it reaches a piece. A bishop lives on one colour for the whole game.
- **Rook.** Any number of squares horizontally or vertically.
- **Queen.** Combines rook and bishop: any number of squares in a straight line in any direction.
- **King.** One square in any direction, as long as that square is not attacked by an enemy piece.

No piece except the knight may pass through an occupied square, and you can never capture your own pieces.

### Castling

Once per game each side may castle, a combined king-and-rook move that tucks the king into a corner and brings the rook into play. The king moves two squares towards a rook and that rook hops over the king to the square beside it. Kingside castling (written O-O) puts the white king on g1 and rook on f1; queenside (O-O-O) puts the king on c1 and rook on d1.

All of these must be true:

1. Neither the king nor the rook you are castling with has moved earlier in the game.
2. Every square between them is empty (queenside needs b1 clear as well).
3. The king is not currently in check.
4. The king does not pass through, or finish on, a square attacked by an enemy piece.

The rook *may* be attacked, and it may pass through an attacked square on the queenside; only the king's squares matter.

### En passant

If a pawn advances two squares and lands directly beside an enemy pawn, that enemy pawn may capture it "in passing" as though it had moved only one square. The capturing pawn moves diagonally onto the square the double-stepping pawn skipped, and the pawn that jumped is removed. This right lasts for exactly one move: if you do anything else, it is gone.

### Promotion

A pawn that reaches the far rank is immediately replaced by a queen, rook, bishop or knight of the same colour, your choice. Almost always you want a queen, but a knight occasionally delivers a check that a queen cannot, and the game lets you choose.

### Check and the king

A king is in check when an enemy piece could capture it on the next move. You may never leave your own king in check, which means you may not make a move that exposes it either; this includes pinned pieces that are shielding the king. If you are in check you must deal with it straight away by moving the king, blocking the line of attack, or capturing the attacker.

### How the game ends

- **Checkmate.** The king is in check and there is no legal way out. The side delivering mate wins.
- **Stalemate.** The player to move is *not* in check but has no legal move. This is a draw, not a loss, which is why a player who is far ahead must stay careful.
- **Threefold repetition.** The same position, with the same player to move and the same castling and en passant rights, occurs three times. Draw.
- **Fifty-move rule.** Fifty consecutive moves by each side without a pawn move or a capture. Draw.
- **Insufficient material.** Neither side has enough to force mate (for example king against king, or king and bishop against king). Draw.

Online you can also offer a draw or resign from the game menu.

## Common beginner mistakes

Moving the queen out early so it gets chased around while the opponent develops. Forgetting that pawns capture diagonally and leaving a piece "safely" in front of one. Castling into a corner where the pawn cover has already been pushed forward. And the classic: delivering a check because it looks aggressive, when it simply moves the enemy king to a better square.

## Playing with friends and family

Choose **Online Multiplayer** to be matched with another player looking for a game; the room starts as soon as two of you are in. To play a specific person, create a **private room**, then ping a friend from your friends list so they get a notification and a one-tap link to join. Voice chat and text chat run alongside the board, and if you are teaching a child or a parent, talking through each move as it happens is the fastest way to learn.

## Choosing an AI level

![The four AI levels, Buddy, Nova, Titan and Oracle, arranged from relaxed to perfect play](/blog/ai-levels.svg)

Every AI opponent on the site uses the same engine but with a different "mistake rate", so you can pick the one that feels right.

- **Buddy** plays a random legal move most of the time. It will hang pieces, miss mates and let you practise checkmating patterns at your own pace.
- **Nova** mixes sensible play with plenty of slips. It is the right choice once you know the moves and want a game you can win with a bit of care.
- **Titan** rarely blunders and will punish an undefended piece or a weak king immediately. Expect a real fight.
- **Oracle** never deliberately errs and searches as deeply as its time budget allows. Treat a draw as a trophy.

## Quick reference

| Topic | Rule |
| --- | --- |
| First move | White |
| Pawn | 1 forward (2 from start); captures diagonally; promotes on the last rank |
| Knight | L-shape, may jump |
| Bishop / Rook / Queen | Diagonals / straight lines / both, any distance |
| King | One square; may never be left in check |
| Castling | King two squares towards an unmoved rook; path empty, king not in or through check |
| En passant | Capture a pawn that just double-stepped past you, on the very next move only |
| Win | Checkmate |
| Draws | Stalemate, threefold repetition, 50-move rule, insufficient material |

## Image guide

![Chess board with a white knight on c3 showing its eight L-shaped destinations and a bishop on d4 with its diagonals shaded](/blog/chess-piece-moves.svg)

The knight's eight jumps and the bishop's four diagonals are the two movement patterns beginners most often get wrong; notice that the knight always lands on the opposite colour.

![Three mini boards showing the position before kingside castling, after kingside castling, and after queenside castling](/blog/chess-castling.svg)

Castling kingside puts the king on g1 and the rook on f1; queenside puts them on c1 and d1 and also needs b1 to be empty.

![Three mini boards showing a black pawn double-stepping to d5, the white pawn capturing en passant onto d6, and the resulting position](/blog/chess-en-passant.svg)

En passant is only available on the move immediately after the double step, and the capturing pawn lands on the square that was skipped, not on the pawn itself.

## References

- [Rules of chess – Wikipedia](https://en.wikipedia.org/wiki/Rules_of_chess)
- [FIDE Laws of Chess – FIDE Handbook](https://handbook.fide.com/chapter/E012023)
- [Algebraic notation (chess) – Wikipedia](https://en.wikipedia.org/wiki/Algebraic_notation_(chess))

## Play it now

The board is ready whenever you are. Start against Buddy to get comfortable, then work your way up.

[Play Chess now](/games/chess)
