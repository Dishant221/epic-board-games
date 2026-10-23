---
title: "Connect 4 strategy: control the centre and count threats"
description: "Go beyond blocking threes. Learn what a threat really is, why odd and even rows decide Connect 4, how stacked threats win and how to count tempo."
pubDate: 2026-10-10
game: connect4
tags: ["connect-4", "strategy", "tactics"]
hero: /blog/heroes/connect-4-strategy-centre-and-threats.png
heroAlt: "Illustrated hero image for Connect 4 strategy: control the centre and count threats"
---

Most Connect 4 games between casual players are decided by someone missing a diagonal. Once both players can spot threes, the game changes character completely: nobody gives away a quick win, the board fills up and the result is decided by who is *forced* to play into a losing cell at the end. That stage is where real Connect 4 strategy lives, and it rests on two ideas: controlling the centre and counting threats by row.

If you have not read the [rules guide](/blog/how-to-play-connect-4), start there. This article assumes you know how discs fall and what four in a row means.

## Why the centre column is worth fighting for

![Heat map showing how many winning lines pass through each cell on the Connect 4 board](/blog/connect4-centre.svg)

Every four-in-a-row line has to pass through specific cells. The diagram counts how many possible lines run through each one. The middle column totals 60 lines; the two columns beside it total 48 each; the edges manage just 24. Owning the centre does not win by itself, but it means almost every horizontal and diagonal line your opponent wants has to pass through a disc of yours.

Practical consequences:

- **Open in the centre** when you move first. It is the only opening that wins with perfect play.
- **If the opponent takes the centre, stack on it.** Discs above the central column still carry heavy line counts, and alternating discs in that column blunt both players' horizontals equally while you build elsewhere.
- **Avoid the edges until they are forced.** An early edge disc is a wasted tempo in most positions.

## What a threat actually is

A **threat** is an empty cell which, if you placed a disc there, would complete four in a row. It does not matter whether the cell is playable right now. A threat that floats above empty space is still a threat; it is simply one that cannot be cashed in until the column fills up beneath it.

This distinction is the heart of the game. A beginner sees three in a row and panics. A strong player asks: *when* will that cell become playable, and *who* will be forced to fill the cell below it?

![A Connect 4 board with a red odd-row threat and a yellow even-row threat marked](/blog/connect4-threats.svg)

In the diagram, red threatens column 5 on row 3 and yellow threatens column 7 on row 4. Neither can be played immediately. The game will revolve around those two cells.

## Odd and even rows

Number the rows 1 to 6 from the bottom. Now think about the end of the game, when every other column is full and the players are forced to play into the remaining columns one disc at a time.

Red moves first, so red places the 1st, 3rd, 5th... disc into any column that both players avoid. In an otherwise empty column that means red gets rows 1, 3 and 5 and yellow gets rows 2, 4 and 6. This is **parity**, and it leads to the single most useful rule in Connect 4:

- **The first player (red) wants threats on odd rows** (1, 3, 5).
- **The second player (second mover, yellow) wants threats on even rows** (2, 4, 6).

![Connect 4 board with odd rows tinted amber and even rows tinted blue to show parity](/blog/connect4-parity.svg)

If red has a threat on row 3 in a column nobody else wants to touch, then when the board fills up yellow will eventually be the one forced to play row 2 in that column, and red drops onto row 3 and wins. A red threat on row 4, by contrast, is usually worthless: red is the one who ends up filling row 3 beneath it, handing yellow the chance to block.

There are exceptions: parity in a column flips whenever someone is forced to play there out of turn. But as a planning tool, "red wants odd, yellow wants even" will carry you a long way.

## Stacked threats and the useless threat above

Two threats in the same column interact in a very specific way:

- If your threat sits **directly above** your opponent's threat, yours is useless. They will play their cell first and win before you get to yours.
- If your threat sits directly above your **own** threat, the lower one is the one that counts, and the upper one is a backup in case they block the first.
- If your threat sits directly above a cell your opponent is forced to fill, you win the moment they fill it.

The last case is the famous **"seven" trap**, so called because the finished shape of discs resembles a figure 7. You create two threats where filling the first forces a disc that unlocks the second. Yellow blocks one and the block itself lifts the column into red's winning cell.

Watch for the simplest version: three of your discs in a row with the fourth cell one square above an opponent's three. They cannot block without giving you the cell above.

## Counting tempo

Once the threats are in place, the game becomes a count of **safe moves**: moves that neither give the opponent a winning cell nor fill the space beneath your own threat. Whoever runs out first is forced into a losing drop.

1. List every column that is still open.
2. For each, note the next playable cell and the cell above it. If playing the next cell hands your opponent the cell above as a win, that column is **poisoned** for you.
3. Count the non-poisoned cells available to each side.

If you have more safe moves than your opponent, keep making quiet moves and let them run out. If you have fewer, you need to create a new threat or change the parity of a column by sacrificing a tempo.

## Blocking order

When you face several threats, block in this order:

1. **Anything playable right now.** An immediate four beats everything.
2. **A threat that would become playable after your most natural move.** Check the cell above where you intend to play.
3. **Threats on your opponent's good parity** (odd for red, even for yellow). These are the ones that will matter in the endgame.
4. **Threats on their bad parity.** Often you can leave these alone entirely.

## Common mistakes at intermediate level

- **Building threats on the wrong parity.** A beautiful red diagonal that ends on row 4 is decoration, not a plan.
- **Filling columns too early.** Every disc you drop into a quiet column changes the parity there and brings the endgame closer. If you are ahead in safe moves, slow down.
- **Forgetting that blocks are discs too.** Your block raises the column. Ask what the next cell up does for your opponent.
- **Giving up the centre to chase an edge threat.** Remember the line counts.

## Practising against the AI

Buddy and Nova are for practising threat spotting without heavy punishment; Titan exploits parity mistakes, so it is the right opponent for threat counting. The Oracle never plays a random move, and since Connect 4 is a first-player win from the centre, take red, open in the middle and see how long you can hold the balance.

## Quick reference

| Concept | Rule of thumb |
| --- | --- |
| Centre column | 60 possible lines pass through it; the edges have 24 |
| Threat | An empty cell that would complete your four |
| Playable threat | A threat whose cell below is already filled |
| Red (first player) | Wants threats on odd rows 1, 3, 5 |
| Yellow (second player) | Wants threats on even rows 2, 4, 6 |
| Threat above opponent's threat | Useless: they cash theirs first |
| Seven trap | Two threats where blocking one unlocks the other |
| Tempo count | Count safe moves; whoever runs out first loses |
| Blocking priority | Immediate four → cell-above threats → good-parity threats → bad-parity threats |

## Image guide

![A Connect 4 board with a red odd-row threat and a yellow even-row threat marked](/blog/connect4-threats.svg)

Red's threat on row 3 is on red's good parity; yellow's threat on row 4 is on yellow's good parity. Whoever has more safe moves elsewhere will force the other to fill the cell beneath.

![Connect 4 board with odd rows tinted amber and even rows tinted blue to show parity](/blog/connect4-parity.svg)

In a column that both players avoid until the end, red fills the odd rows and yellow the even ones. Plan your threats accordingly.

## References

- [Connect Four on Wikipedia](https://en.wikipedia.org/wiki/Connect_Four), including the mathematical solution and the role of the centre column
- [Zugzwang on Wikipedia](https://en.wikipedia.org/wiki/Zugzwang): the compulsion to move that drives the Connect 4 endgame
- [John Tromp's Connect 4 page](https://tromp.github.io/c4/c4.html) with position counts and the eight-ply database

## Play it now

Open [Connect 4](/games/connect-4), choose Titan and play red. Take the centre, build on odd rows and count your safe moves before every drop.
