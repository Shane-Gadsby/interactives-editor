# Pictures (image layers)

Pictures (type "image"): assetId, fit (cover | contain | fill) and an optional crop {x, y, zoom} that moves and zooms the picture inside its frame without touching the file: zoom is 1 to 20 (2 shows the middle quarter), x and y are fractions of the frame's width and height the picture is moved by (0.1 is a tenth to the right), and the frame clips the rest. Leave crop off for the picture as fit draws it. A new picture wants an ariaLabel saying what it shows (or decorative: true).
