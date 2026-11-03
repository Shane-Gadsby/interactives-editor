Sample files for the importer tests (`../real-files.test.ts`). All were generated for this repo, none is third-party art:

- `chrome-vectors.pdf`, `chrome-rotated.pdf`: headless Chrome `Page.printToPDF` of an HTML page (shapes, linear and radial gradients, dashes, a clip, embedded subset TrueType text in Type0/Identity-H, an alpha PNG, two pages). The rotated one has `/Rotate 90` and `/Rotate 270` added.
- `cairo-features.pdf`: pycairo (PDF 1.7: object streams and a cross-reference stream with a PNG predictor), gradients with alpha stops, clips, group opacity, a mask, rotated text, an image.
- `gs-jpeg.pdf`, `gs-cmyk.pdf`: Ghostscript `pdfwrite` of the two above (DCT picture with a soft mask; DeviceCMYK colours).
- `gs-postscript.pdf`: Ghostscript from a hand-written PostScript file (non-embedded Type 1 fonts, tiling pattern, axial and radial shadings, even-odd clip, dash).
- `libreoffice-draw.pdf`, `libreoffice-writer.pdf`: LibreOffice 26.2 from an SVG and an .fodt (stepped gradient polygons; justified text, bullets in OpenSymbol, a table, a second page).
- `synthetic-illustrator.ai`: a hand-written PDF-compatible Illustrator file: layers (OCGs, one hidden), CMYK, a Separation colour, stitched axial and radial shadings, a mesh shading, a Type 3 font, a luminosity soft mask, an isolated transparency group, three artboards (one with TrimBox and `/Rotate 90`), and trailing private data after `%%EOF`.
- `photocraft-poster.pcraft`, `header-only-*.dwg`: the poster was written by the PhotoCraft format crate (`photocraft-format` save_to_bytes, a document with a painted layer, a mask, a gradient fill, a shape and a text layer); the DWG files are 6 byte version codes plus noise.
