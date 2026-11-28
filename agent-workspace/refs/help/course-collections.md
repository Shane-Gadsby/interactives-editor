# Course collections (passport stamps and badges)
Named stamps and counters that every interactive in the same StudyDesk course can read and add to, so a set of pieces can share one passport.

A **course collection** is a passport or badge case with a name you choose. Each learner has their own copy in each course, and **every interactive that uses the same name** adds to it and reads it. A piece released in week 2 can stamp the passport, and a piece released in week 9 can see that stamp and unlock something. The pieces do not need to be in one project, or know about each other.

## Stamps and counters
- A **stamp** is a short text (up to 60 characters): `Gold star`, `Week 2 done`. A collection holds each stamp once, whatever the capitals or spacing, so adding it again changes nothing. A collection holds up to 200 stamps.
- A **counter** is a name with a number: `quizzes` at 3. A counter only ever goes **up**. Adding `quizzes` at 2 when it is already 3 leaves it at 3, and the larger number wins, not the latest. That way two pieces that both count the same thing, or one tab behind another, cannot take each other's progress back. A collection holds up to 100 counters, from 0 to a billion.
- Names (the collection's, and a counter's) ignore capitals and keep only letters, numbers, spaces, dashes and underscores. A person can keep up to 20 collections in a course.

## The nodes
- **Add a stamp to the course passport** (also called **Add to course collection**) puts a stamp in, or raises a counter. Type the **Collection** name, choose **A stamp** or **To a counter**, and type the **Name** as plain words (`Gold star`). Use a formula for a name that changes (`"Level " + level`) or for several stamps at once (a list of texts). It continues from **Added** when something was new and from **Nothing new** when it was already there, so you can say "you already have this one".
- **Load the course passport** (**Load course collection**) fetches the collection and can fill a **list variable** with the stamps and a **number variable** with how many there are. It continues from **Loaded** when there is anything in it, and from **Empty** when there is not.
- **Check the course passport** (**Check course collection**) branches on a stamp (**Has it** or **Not yet**), a counter at least a number, or both. It can write the counter's number into a variable. It uses what was fetched last, and fetches the collection first if it has not been yet.

In a script: `await ix.course.stamp('passport', 'Gold star')` (a text or a list of texts, resolves with how many were new), `await ix.course.count('passport', 'quizzes', 3)` (1 when the counter went up, otherwise 0) and `const c = await ix.course.read('passport')`, which gives `{stamps, counts, course}` (or `null` when nothing keeps collections here). Counter names come back in lower case.

## Where it is kept
On the **StudyDesk learner page** (**Share**, then **Link for StudyDesk**, see [Share link](export#share-link)) a collection is kept on the server under the signed-in person and the course they came from. The server works out who and which course from their session, never from anything the project sends, and a person can only ever reach their own collections. The course must be one the person is in: with no sign-in, or a sign-in that is not in a course, there is nowhere on the server to keep it.

**Preview, an export, or a link opened outside StudyDesk has no course.** There the collection is kept in **that browser only**, under its name, and shared by the projects you open in it. It works so you can build and try the passport, but a stamp earned in Preview is not in the real course, and the toolbar says **Course collections: this browser only** while a project that uses them is previewing. **Forget course collections** in Preview's toolbar empties them.

To use the same passport in several pieces, type the **same collection name** in each, and share each with its own **Link for StudyDesk**. The collection belongs to the learner and the course, not to a project, so deleting or unsharing a project does not clear it.

## Privacy
A course collection holds only the stamps and counters a project added, with the learner's StudyDesk username and course so it can be found again. It is never shown to other learners, and the project's owner does not see it in Results or Insights (it is not part of either). Do not put anything in a stamp or counter name that you would not want kept against a learner's account for the length of the course: use short, plain labels like `Gold star`, not what the learner typed. A learner's collections can be removed by the Toolbox's administrators on request.
