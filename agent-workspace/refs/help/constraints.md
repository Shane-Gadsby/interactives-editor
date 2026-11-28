# Constraints
Make a layer follow a path or copy another layer's position, rotation or scale.

Constraints keep a layer tied to another one while things move. Add one in the **Constraints** section of the inspector.

| Constraint | What it does |
|---|---|
| Follow path | Places the layer along a path. **Distance** (0 to 100%) is how far along; animate it to move along the path. **Orient** turns the layer to face along the path. |
| Copy position | Takes another layer's position (plus an offset). Untick **Copy x** or **Copy y** to take only one axis. |
| Copy rotation | Takes another layer's rotation. |
| Copy scale | Takes another layer's scale (untick **Copy x** or **Copy y** for one axis). |
| IK, Distance | Reach a target with a chain of bones, or keep a set distance from a layer. See [Bones and skinning](bones). |

The three copy constraints share some options. **Read** chooses *World values* (where the other layer ends up on the artboard) or *Local values* (its own position, rotation or scale inside its parent). **Factor** multiplies what is copied (0.5 follows half as far, -1 mirrors it). **Add to own** adds the copied value to the layer's own instead of replacing it (for scale it multiplies). **Limit** keeps the result within a range: *Min* and *Max* for x or rotation or horizontal scale, and *Min y* and *Max y* for the vertical ones.

Every constraint has a **Strength** (0 to 100%) that mixes between the layer's own value and the constrained one, and it can be animated. Constraints are applied in the player and on the canvas.
