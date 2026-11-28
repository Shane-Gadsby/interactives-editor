# Components (instance layers)

An instance (a component) takes its box from fit: fill stretches the page to the box, contain letterboxes it, cover fills and crops, none draws it at its own size centred, and hug keeps the box width and lets its height follow whatever the page inside needs as it plays, easing the way that page does (the source artboard has to have hugHeight on; the height stored on the instance layer is ignored while it does).
