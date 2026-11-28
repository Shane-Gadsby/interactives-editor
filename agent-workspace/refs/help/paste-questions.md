# Paste questions from Word or Excel
Paste a list or table of questions from Word or a spreadsheet, or open a filled in template, see a preview, and add them as kit questions.

If your questions are already in Word or a spreadsheet, you do not have to retype them. Paste them in, check what the editor understood, and add them as [questions](question-kit).

1. Open the **Add question** menu and choose **Paste questions from Word or Excel**.
2. Paste the questions into the box, or press **Open a file…** to read a filled in template.
3. Check the preview. It shows the questions it understood, the lines it did not (**Not understood**) and anything it changed on the way in.
4. Press **Add questions** (the button counts them, for example **Add 3 questions**). Nothing is added until you do.

Each question gets a page of its own and is an ordinary [question](question-kit) from then on. You can also press <kbd>Ctrl</kbd>+<kbd>K</kbd> and type "paste questions" to open it from the [command palette](command-palette).

![The Paste questions dialog: lines pasted on the left, what it understood and what it did not on the right.](help/paste-questions.png)

## Templates to fill in
Each template has a worked example of every kind of question it reads: multiple choice, multiple answer, true/false, fill in the blank and matching.

- [Word template (.docx)](templates/question-template.docx): a block of lines for each question.
- [Excel template (.xlsx)](templates/question-template.xlsx): a row for each question, with a second sheet of instructions.
- [CSV template (.csv)](templates/question-template.csv): the same rows, as a plain file for any spreadsheet.

Delete the examples (or write under them) and fill in your own. Then copy what you wrote and paste it in, or open the saved file.

Headings and grey notes in the Word file are ignored, so it does not matter if you leave the examples in. Only the first sheet of the Excel file is read.

## As lines (Word, email, a text file)
One question in each block, with a blank line between questions. The first line is the question (a number in front of it, like `1.` or `Q1:`, is dropped) and every line after it is a choice:

```
Type: Multiple choice
1. Which planet is closest to the Sun?
a) Venus
b) Mercury *
c) Earth
Feedback: Mercury orbits closest.
```

- **Right choice**: put a `*` after it (or before it), or a tick, `(correct)`, `[x]`. Or give an **Answer** line with its letter, number or text: `Answer: B`. For more than one: `Answer: A, C`, or mark each.
- **Letters and bullets** (`a)`, `A.`, `1)`, `-`) in front of a choice are optional, and a plain list pasted from Word works.
- **True/False**: the question, then `Answer: True` or `Answer: False`. Choices called True and False with one marked work too.
- **Fill in the blank**: the question, then `Answer: H2O | h2o`, every accepted answer split by `|`.
- **Matching**: a pair on each line, written `France = Paris` (or `->`), two to 8 pairs.
- **Type** is optional: Multiple choice, Multiple answer, True/False, Fill in the blank or Matching. Without it the kind is worked out (a question with two or more right choices becomes Multiple answer). **Title** names the page. **Feedback** is shown once the question is finished.

## As a table (Excel, Word table, CSV)
Copy the cells (with the headings) and paste. The headings are matched by their words, in any order: **Type**, **Question**, **Option 1**, **Option 2** and so on (as many as you like), **Correct** and **Feedback**.

- **Correct** takes the letter or number of the right choice (`B` or `2`), several as `A, C`, or `True`/`False`. You can also mark the right option with a `*` instead.
- For fill in the blank the option cells are the accepted answers.
- For matching each option cell is a pair, `term = match`.
- With no heading row, the first cell of a line is the question and the others are choices.

## What it will not read
Ordering, categorise and hotspot questions are not pasted (add them from the Add question menu), and nor are pictures, part marks or feedback on individual choices. Every line it cannot use is listed in the preview with its line (or row) number and why, so you can fix it in the box and see it change. At most 100 questions are added at once.
