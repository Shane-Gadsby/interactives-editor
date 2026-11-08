# Launching Interactives from your LMS (LTI 1.3)

Interactives can be launched from any learning platform that speaks LTI 1.3 (Moodle, Canvas, Blackboard, Brightspace, and others), alongside the StudyDesk link. A learner who opens a project this way is recognised by the platform, and their progress and results are kept under their platform identity and the course they came from. Staff can also use the platform's "select content" (Deep Linking) picker to add one of their projects to a course without copying links by hand.

This page is for the person who administers the LMS (to register the tool) and for an Interactives power user (to register the LMS on our side). Nothing here contains a secret. The tool's own signing key is made by the server and never leaves it, and the platform's keys are public.

## What the LMS administrator needs from us

Replace `https://tools.example.edu` with the address the editor is served from. These exact values are also shown to power users by `GET /interactives/api/lti13` (the `urls` object).

| LMS field (names vary) | Value |
|---|---|
| Tool name | Interactives |
| OIDC login initiation URL (Initiate login URL, Login URL) | `https://tools.example.edu/interactives/lti13/login` |
| Redirect URI(s) (Launch URL, Redirect URL) | `https://tools.example.edu/interactives/lti13/launch` |
| Target link URI (Tool URL, Default launch URL) | `https://tools.example.edu/interactives/lti13/launch` |
| Public keyset (JWKS) URL | `https://tools.example.edu/interactives/lti13/jwks` |
| Public key type | "Keyset URL", not a pasted key. The keys rotate and the keyset follows |
| Deep Linking (Content Selection) URL | `https://tools.example.edu/interactives/lti13/launch` |
| Supports Deep Linking | Yes, with content type "LTI resource link" |
| Privacy | Send the learner's name (it is shown in the project's results). Email is not used |

Message types: `LtiResourceLinkRequest` and `LtiDeepLinkingRequest`. Assignment and Grade Services (grade passback, scores only) is used for projects that mark answers on the server, see [Grades](#grades) below. For it, turn on Assignment and Grade Services for the tool (the score scope) and set the link up for grades in the course.

The LMS then gives you values for our side. Send these to an Interactives power user:

- **Issuer** (the platform's `iss`, for example `https://lms.example.edu`)
- **Client ID** it made for this tool
- **Deployment ID(s)**
- **OIDC authorization (auth login) URL**
- **Public keyset (JWKS) URL** of the platform
- **Access token URL** (needed for grade passback: the tool asks for a token here)

## What a power user does on our side

All of this is the API under `/interactives/api/lti13`, for power users with power user mode on (F9). The calls are made from the browser console of a signed in editor tab, or with any HTTP client that sends the session. There is no page for it yet.

Register the platform (the id is a short name you choose, lowercase letters, digits and dashes):

```
PUT /interactives/api/lti13/platforms/example-lms
{
  "name": "Example LMS",
  "issuer": "https://lms.example.edu",
  "clientId": "<client id from the LMS>",
  "deploymentIds": ["<deployment id>"],
  "authLoginUrl": "https://lms.example.edu/auth",
  "jwksUrl": "https://lms.example.edu/jwks",
  "tokenUrl": "https://lms.example.edu/token"
}
```

All the urls have to be https. A platform with the same issuer and client ID can only be registered once. Platforms can also be listed in the `LTI13_PLATFORMS` environment variable (a JSON array of the same fields plus `id`), which cannot be edited through the API.

`DELETE /interactives/api/lti13/platforms/:id` removes one.

### Linking staff for the picker

The picker lists the staff member's own projects that have a Link for StudyDesk turned on. The platform sends its own user id (`sub`) and has no idea who they are in the editor, so a power user links the two once:

```
PUT /interactives/api/lti13/links
{ "platform": "example-lms", "sub": "<the user's id on the platform>", "username": "<their editor username>" }
```

A staff member who opens the picker before being linked sees their platform id and user id on screen, which are exactly what the power user needs. `DELETE /interactives/api/lti13/links?platform=...&sub=...` unlinks.

### Keys

The tool makes an RSA signing key the first time it starts and publishes the public half at `/lti13/jwks`. To rotate: `POST /interactives/api/lti13/keys/rotate`. The new key signs from then on and the old one stays published (platforms cache keysets) until you delete it with `DELETE /interactives/api/lti13/keys/:kid`, a day or two later. `GET /interactives/api/lti13` lists the keys by id and date, never the keys themselves.

### Server settings

| Variable | Does |
|---|---|
| `INTERACTIVES_PUBLIC_URL` | the public origin (`https://tools.example.edu`). Set it on every real box: without it the tool works the origin out from the request, which is only right when the proxy passes the host and `X-Forwarded-Proto` along |
| `LTI13_PLATFORMS` | optional JSON array of platform registrations |
| `LTI13_ALLOW_HTTP` | `1` allows http urls for a development LMS. Never on test or prod |

The server needs five Mongo collections in `lti-interactives` (`lti13-platforms`, `lti13-keys`, `lti13-state`, `lti13-sessions`, `lti13-links`) and the indexes in `suite-libs/indexes.js` for them: the logins and launch sessions expire on their own.

## Grades

A project with questions set to **Mark answers on the server** (a spelling test, a quiz whose marks matter) sends its score to the LMS gradebook. Nothing else does: a result the learner's browser reports is never sent, because the browser's word is not good enough for a grade.

- **When.** Once every server-marked question is finished, the server sends the score on record with the project's total points (`scoreGiven` and `scoreMaximum`), `activityProgress: Completed`, `gradingProgress: FullyGraded`. It sends again only when the score on record changes: a better retake, or the latest round when the test keeps that one. The LMS scales the score to the grade item's own maximum.
- **Where.** To the line item the launch named (`lineitem` in the AGS endpoint claim), at `<line item>/scores`. A launch without a line item (the course has no grade set up for that link) sends nothing, and the learner's record says nothing was sent. The tool never creates grade items itself; the picker asks the course for one when it adds a project that marks on the server (the content item carries `lineItem` with a maximum of 100).
- **How it authenticates.** Client credentials with a signed assertion: the tool signs a short JWT (iss and sub the client ID, aud the platform's access token URL) with its own key, the same key published at `/lti13/jwks`, and asks the platform's token URL for a token with the score scope only. The token is kept until it is nearly out and dropped when the platform is edited.
- **If it fails.** The refusal is written on the learner's record (`grade`: the score, whether it was sent, why not, when). The server tries again about 30 seconds later (`IX_GRADE_RETRY_MS`, 0 turns that off) and on the learner's next click in the activity, no more often than every 20 seconds. A learner who finishes and never comes back after a failure is not retried: check the record, or have the learner open the activity again.
- **Not sent** for learners who signed in through StudyDesk's own login (the suite session), only for LTI 1.3 launches.

## What learners and staff see

- **Learners.** Opening an Interactives link in the course shows the project straight away. Progress and results are saved under their name from the LMS and that course. Staff Insights and Results show them like any other learner. There is no sign-in step, and nothing to remember.
- **Staff adding content.** In the course, choose to add content from an external tool and pick Interactives. The picker lists your own projects that have a Link for StudyDesk turned on (make one from the project's Share button first), tick one or more, and the course gets a link for each.
- **Remix** is hidden for learners who came in from an LMS, since they have no editor account.

## How it is kept safe

- The login can only start at registered platforms, and only for this tool's own launch address, so it cannot be used to bounce someone to another site.
- Each login makes a one-time state and nonce, held for ten minutes, and a cookie for that state (`SameSite=None; Secure; HttpOnly; Partitioned`, so it survives inside an LMS frame). The state is used up the first time a launch arrives, whether or not the launch is accepted, so a token cannot be replayed or fixed up and retried.
- The launch token has to be signed RS256 by a key in the platform's published keyset, and its issuer, audience, authorized party, expiry, issue time, not-before, nonce, deployment ID, LTI version and target link are all checked. Nothing in the token chooses which key or algorithm is used.
- A launched learner is given a session that only works for the one project they were launched into, for eight hours. It travels in the address fragment and a request header, never in a cookie or a query string.
- The deep linking answer is signed with our own key, lists only projects the linked staff member owns with a link on (checked again when they press the button), and each picker can be used once, within half an hour.

## Not done yet

- Grades are scores only. No line item management, names and roles, or a page of failed grades to resend.
- A page in the editor for registering platforms and linking staff, and a way for staff to link themselves.
- Dynamic registration.
