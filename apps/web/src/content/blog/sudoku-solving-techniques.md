---
title: "Sudoku solving techniques from singles to X-wings"
description: "A step-by-step ladder of Sudoku techniques: naked and hidden singles, pairs, pointing pairs, claiming, X-wing and swordfish, with worked examples."
pubDate: 2026-10-14
game: sudoku
tags: ["sudoku", "strategy", "techniques", "advanced"]
hero: /blog/heroes/sudoku-solving-techniques.png
heroAlt: "Illustrated hero image for Sudoku solving techniques from singles to X-wings"
---

Every Sudoku technique is the same idea wearing a different coat: a digit has to go *somewhere* in each house, and if you can prove it cannot go in certain cells, it must go in the ones that remain. The techniques below form a ladder; climb it in order, because the cheaper rungs almost always have something left to give. If you have not played before, read [How to play Sudoku](/blog/how-to-play-sudoku) first.

## Before you start: pencil marks

Everything from the third rung onward relies on candidates. Switch on pencil mode and, box by box, note every digit that could legally sit in each empty cell. Placing a digit is a good moment to sweep it out of the surrounding notes. Accurate notes are the engine of every technique below.

## 1. Naked single

A cell with exactly one candidate. If a cell's row, column and box together already contain eight different digits, the ninth is forced.

*Example:* a cell sits in a row holding 1, 3, 5, 9, a column holding 2, 6 and a box holding 4, 8. Only 7 is missing. Place it.

## 2. Hidden single

A digit that has only one possible cell within a house, even though that cell has other candidates too. The single is "hidden" among the other notes.

*Example:* in a box the digit 3 appears as a candidate in just one cell, which also lists 3, 5 and 8. The 5 and 8 are irrelevant; 3 has nowhere else to go in that box, so the cell is 3. Scanning (cross-hatching) is the paper-and-pencil way of finding hidden singles.

## 3. Naked pair and naked triple

Two cells in the same house whose candidates are exactly the same two digits. Together they will consume both digits, so those digits can be removed from every other cell of that house.

*Example:* two cells in a box both read {2, 5}. Another cell in the box reads {5, 8}. Strike the 5 and it collapses to 8, a brand-new naked single. The diagram below shows exactly this situation.

A **naked triple** is three cells whose candidates, pooled together, contain only three digits, such as {1, 4}, {4, 7} and {1, 7}. Not every cell needs all three digits; what matters is that three cells share a pool of three.

## 4. Hidden pair

The mirror image. Two digits that appear as candidates in only two cells of a house, even though those cells also hold other notes. Those two cells must take those two digits, so every *other* candidate in them can be deleted.

*Example:* in a row, 6 and 9 are each possible only in columns 4 and 8. Columns 4 and 8 read {1, 6, 9} and {6, 7, 9}. Remove the 1 and the 7; both cells are now a naked pair of {6, 9}, which may unlock more eliminations along the column or box.

## 5. Pointing pairs (box-line reduction)

Look inside a box. If all the candidates for a digit sit in a single row (or a single column) of that box, then the digit must be in that row within the box, so it cannot appear in the same row *outside* the box.

*Example:* in the top-middle box, candidate 2 appears only in the top row, in two cells. Those two cells "point" along row 1, so delete every 2 from row 1 in the top-left and top-right boxes.

## 6. Claiming (line-box reduction)

The same idea from the line's point of view. If all the candidates for a digit in a row (or column) fall inside one box, then that box's other cells cannot hold the digit.

*Example:* in column 5, the digit 8 is possible only in rows 4, 5 and 6, which all belong to the centre box. The centre box must place its 8 in column 5, so strike 8 from the other six cells of that box.

## 7. X-wing

Now the pattern solvers love to find. Choose a digit. Find **two rows** in which that digit is a candidate in **exactly two cells each**, and check whether those four cells share the **same two columns**. If they do, they form a rectangle, and the digit can be eliminated from every other cell of those two columns.

Why it works: each row must place the digit in one of its two cells. If row A uses the left column, row B cannot (the digit would repeat in that column), so row B uses the right one. Either way both columns get their digit from a corner, and nothing else in those columns can be that digit.

The pattern works the other way round too: two columns with exactly two candidate cells each, sharing the same two rows, let you eliminate along the rows.

*Example:* candidate 4 appears in row 2 only at columns 2 and 6, and in row 7 only at columns 2 and 6. Strike 4 from every other cell of columns 2 and 6. The diagram below shows the rectangle and the red eliminations.

## 8. Swordfish

The 3×3 extension of an X-wing. Take three rows in which a digit is restricted to at most three cells each, all falling into the same three columns. The digit can then be eliminated from those columns outside the pattern. Two cells per row is fine, as long as the overall footprint is three columns. Swordfish are rare, which is why they sit near the top of the ladder.

## When to ask for a hint

Our hint is driven by a solver, so it never guesses. Use it when you have exhausted the rungs you know: it places one logically certain digit, and you can work backwards to see why it was forced. Treat it as a worked example rather than a shortcut. It is also a sanity check: if a hint lands in a cell you had ruled out, one of your pencil marks is wrong.

## A suggested routine

1. Place every naked single and hidden single you can find. Repeat until none remain.
2. Fill pencil marks for the whole grid.
3. Look for pairs and triples, then pointing pairs and claiming. Each elimination may create a new single; go back to step 1 when it does.
4. Only now hunt for X-wings and swordfish, one digit at a time.
5. If the grid still resists, take a hint and reverse-engineer it.

## Common mistakes

- **Searching for X-wings too early.** They are rarely needed below the hardest levels; a missed single is far more likely.
- **Confusing "exactly two" with "at least two".** An X-wing requires exactly two candidate cells in each of the two base rows.
- **Not pooling candidates for triples.** Cells like {1, 4} and {4, 7} can be part of a triple even though neither holds all three digits.
- **Trusting stale notes.** Rebuild the pencil marks for a box if something feels off.

## Quick reference

| Rung | Technique | Looks for | Result |
| --- | --- | --- | --- |
| 1 | Naked single | Cell with one candidate | Place it |
| 2 | Hidden single | Digit with one cell in a house | Place it |
| 3 | Naked pair / triple | 2 (3) cells sharing 2 (3) candidates | Remove them elsewhere in the house |
| 4 | Hidden pair | 2 digits confined to 2 cells | Remove other candidates from those cells |
| 5 | Pointing pair | Digit in a box confined to one line | Remove it from the line outside the box |
| 6 | Claiming | Digit in a line confined to one box | Remove it from the rest of the box |
| 7 | X-wing | 2 rows × 2 columns rectangle | Remove digit from the columns (or rows) |
| 8 | Swordfish | 3 rows × 3 columns | Remove digit from the columns (or rows) |

## Image guide

![A Sudoku grid with one row, one column and one box highlighted, labelled as the three kinds of house](/blog/sudoku-boxes.svg)

Every technique works within houses; keep the row, column and box of each candidate in mind as you eliminate.

![A zoomed 3×3 box in which two cells hold the candidates 2 and 5, with 2 and 5 struck out in red from the other cells](/blog/sudoku-naked-pair.svg)

A naked pair claims both digits for itself, so they can be removed from the rest of the box, here turning {5, 8} into a plain 8.

![A Sudoku grid with four violet cells forming a rectangle for candidate 4 across rows 2 and 7 and columns 2 and 6, plus red cells where 4 is eliminated](/blog/sudoku-xwing.svg)

The X-wing: two rows each with exactly two candidate cells in the same two columns, and the digit vanishes from those columns elsewhere.

## References

- [Glossary of Sudoku terms (includes X-wing and swordfish)](https://en.wikipedia.org/wiki/Glossary_of_Sudoku)
- [Mathematics of Sudoku](https://en.wikipedia.org/wiki/Mathematics_of_Sudoku)
- [Sudoku solving algorithms](https://en.wikipedia.org/wiki/Sudoku_solving_algorithms)

## Play it now

Pick a hard or fiendish puzzle, turn on pencil mode and work the ladder from the bottom up. [Play Sudoku now](/games/sudoku) and see how far you get before you need the solver's help.
