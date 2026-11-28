# event nodes, part 2 of 2

### event.listDrop — On list drop (event)
Runs when a copy of a list is dragged to another place in it or to another list. The list variable has already changed. `event.item` is the item that moved, `event.from` and `event.to` the names of the lists, `event.index` its new place (from 0), `event.fromIndex` where it was, and `event.moved` is true when it went to another list.
Gives: event.item, event.from, event.to, event.index, event.fromIndex, event.moved
- list (node): A repeater that items are dragged into. Empty: every one
- onlyIf (expr, default ""): Runs the flow only when this is true. event is in scope, with what this event gives

### event.dragEnd — On drag end (event)
Runs when a draggable layer is let go anywhere, or the pick-up is cancelled. Escape cancels a pick-up. Fires after On drop. `event.result` is accepted, rejected, missed or cancelled; `event.zone` the zone it is in now, `event.dropped` true when a zone took it.
Gives: event.result, event.zone, event.dropped
- target (node): Leave empty to fire for every draggable layer
- onlyIf (expr, default ""): Runs the flow only when this is true. event is in scope, with what this event gives

### event.media — On microphone or camera (event)
Runs when something happens with a recording, the camera or a photo. Something happened with a recording, the camera or a photo: a recording started, a recording is ready (the learner pressed Stop, a length limit was reached, or the device went away; `event.reason` says which), a recording could not start (`event.problem` and `event.message` say why, in plain words), the microphone or camera state changed (including the learner choosing not to use them), a video recording finished playing, or a photo arrived. Needs the microphone, camera or photos ticked in Project > Microphone and camera.
Gives: event.reason, event.problem, event.message
- when (select: ready|started|failed|state|played|photo|listening, default "ready")
- slot (text, default ""): Only for this recording. Leave empty for any.
- onlyIf (expr, default ""): Runs the flow only when this is true. event is in scope, with what this event gives

### event.dataLoaded — On data loaded (event)
Runs when a data source finishes loading or refreshing. `event.data` holds the value.
Gives: event.data
- source (data)
- onlyIf (expr, default ""): Runs the flow only when this is true. event is in scope, with what this event gives

### event.animationEnd — On animation clip end (event)
Runs when a Frameling animation layer finishes a clip, or a looping clip comes round. A play-once clip fires once, when it stops on its last frame. A looping clip fires each time it comes round (`event.looped` is true). `event.layer` is the layer's name and `event.clip` the clip (empty for the whole animation).
Gives: event.layer, event.clip, event.looped
- target (node): Leave empty to fire for every animation layer
- clip (text): Leave empty to fire for every clip
- onlyIf (expr, default ""): Runs the flow only when this is true. event is in scope, with what this event gives

### event.animationMarker — On animation marker (event)
Runs when a playing Frameling animation reaches a marker placed in Frameling (a footstep, a hit). Markers are named moments the artist put on frames in Frameling. Only markers inside the clip that is playing count, on every lap of a loop. `event.marker` is the marker's name, `event.frame` its frame in the whole animation, `event.layer` the layer's name and `event.clip` the clip.
Gives: event.marker, event.frame, event.layer, event.clip
- target (node): Leave empty to fire for every animation layer
- marker (text): Leave empty to fire for every marker
- onlyIf (expr, default ""): Runs the flow only when this is true. event is in scope, with what this event gives

### event.overlayOpen — On overlay open (event)
Runs on an overlay page (a tooltip, modal, confirmation, prompt or toast) as it opens, whoever opened it. Put it on the overlay page itself. It runs before the overlay has faded in, after what the layer hands it is set, so a flow here can fill the page for this opening. event.layer is the name of the layer that opened it (empty when its variable or a flow did), event.index the number of that layer when it is a copy of a repeater, and event.inputs what it was handed.
Gives: event.layer, event.index, event.inputs, event.overlay
- onlyIf (expr, default ""): Runs the flow only when this is true. event is in scope, with what this event gives

### event.overlayClose — On overlay close (event)
Runs on an overlay page as it closes, however it was closed. Put it on the overlay page itself. event.layer is the layer that had opened it, as for On overlay open.
Gives: event.layer, event.index, event.overlay
- onlyIf (expr, default ""): Runs the flow only when this is true. event is in scope, with what this event gives

### event.storyEnd — On story end (event)
Runs when the story reaches an -> end line, with the ending it named. The ending is in event.ending ("Joined the club" for -> end Joined the club, empty for a plain -> end). Wire it to a page of endings, or to Go to page for the title screen. The story keeps showing its last line until something moves on.
Gives: event.ending
- onlyIf (expr, default ""): Runs the flow only when this is true. event is in scope, with what this event gives

### event.storyLine — On story line (event)
Runs as each line of the story comes up, or only someone's lines. event.speaker is who says it (empty for narration), event.text the words and event.line the line's hidden id. For a reaction the script doesn't need to know about: a portrait in a corner, a count of lines read, a sound.
Gives: event.speaker, event.text, event.line
- speaker (text): Only this person's lines (as the script names them). Empty: every line
- onlyIf (expr, default ""): Runs the flow only when this is true. event is in scope, with what this event gives

### event.storyChoice — On story choice (event)
Runs when the reader picks one of the story's choices. event.number is which one (from 1, among those on show) and event.choice its words.
Gives: event.number, event.choice
- onlyIf (expr, default ""): Runs the flow only when this is true. event is in scope, with what this event gives

### event.storyScene — On story scene (event)
Runs when the story reaches a scene (a # line), or one scene by its title. event.scene is the scene's title and event.chapter the chapter's name.
Gives: event.scene, event.chapter
- scene (text): Only this scene. Empty: every scene
- onlyIf (expr, default ""): Runs the flow only when this is true. event is in scope, with what this event gives

### event.flow — Flow (event)
Steps with a name that Call flow runs from anywhere on the page, so they are wired once. Give it a name and, if it takes any, the names of its inputs. A Call flow node hands it values, and the steps after it read them as `event.<input>` (`event.amount`). Flows on the page master can be called from every page that uses it.
- name (text)
- inputs (text): The names of the values it takes, separated by commas
- onlyIf (expr, default ""): Runs the flow only when this is true. event is in scope, with what this event gives
