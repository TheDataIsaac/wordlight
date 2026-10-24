# Third-party notices

Wordlight's own source is under the MIT licence in `LICENSE`. It has no npm dependencies. This file lists the
third-party work it follows, ships with or connects to.

## Code

### QR code generator (Project Nayuki)
`dist/qr.mjs` encodes QR codes in the same steps as Project Nayuki's QR Code generator library
(https://www.nayuki.io/page/qr-code-generator-library), which is under the MIT licence:

> Copyright (c) Project Nayuki. (MIT License)
>
> Permission is hereby granted, free of charge, to any person obtaining a copy of
> this software and associated documentation files (the "Software"), to deal in
> the Software without restriction, including without limitation the rights to
> use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
> the Software, and to permit persons to whom the Software is furnished to do so,
> subject to the following conditions:
>
> - The above copyright notice and this permission notice shall be included in
>   all copies or substantial portions of the Software.
> - The Software is provided "as is", without warranty of any kind, express or
>   implied, including but not limited to the warranties of merchantability,
>   fitness for a particular purpose and noninfringement. In no event shall the
>   authors or copyright holders be liable for any claim, damages or other
>   liability, whether in an action of contract, tort or otherwise, arising from,
>   out of or in connection with the Software or the use or other dealings in the
>   Software.

### Node.js
The source needs Node.js 20 or newer, installed separately. The portable Windows package built by
`tools/build-portable.mjs` includes the official Node.js runtime (`runtime/node.exe`) unchanged, with its licence
file from the same nodejs.org download in `runtime/LICENSE.txt`.

### Fonts
DM Sans and Libre Baskerville (SIL Open Font License 1.1) are loaded from Google Fonts when the studio starts. They
are not included in this repository or the portable package.

## Bible text

No Bible text is stored in this repository.

The portable package includes the official, unchanged eBible.org archives below as seed packs, installed on first
start. Each archive contains its own copyright notice, and `bibles/BIBLES.txt` in the package lists them.

| Version | eBible.org id | Licence |
| --- | --- | --- |
| King James Version | eng-kjv2006 | Public domain outside the United Kingdom |
| American Standard Version | eng-asv | Public domain |
| World English Bible | engwebp | Public domain |
| Open Yoruba Contemporary Bible | yor | Copyright © 2009, 2017 Biblica, Inc. CC BY-SA 4.0 |

Open Yoruba Contemporary Bible: Biblica® Open Yoruba Contemporary Bible™. Copyright © 2009, 2017 by Biblica, Inc.
"Biblica" is a trademark registered in the United States Patent and Trademark Office by Biblica, Inc. Used with
permission. Licensed under CC BY-SA 4.0 (https://creativecommons.org/licenses/by-sa/4.0/). Source:
https://ebible.org/Scriptures/details.php?id=yor. Slides and saved shows that use it carry this credit.

**NKJV** (New King James Version, copyright © 1982 by Thomas Nelson) is not included anywhere. Wordlight looks it up
when asked, from the user's own licensed file, the user's own API.Bible key, or bolls.life, and shows the Thomas Nelson
copyright line with it.

## Online services
Used only when a lookup needs them. None of them receives shows, songs or keys, except that a user's own API.Bible key
is sent to API.Bible.

- bible-api.com: English verse lookups (https://bible-api.com/)
- AO Lab Free Use Bible API, bible.helloao.org: Yorùbá and other open translations (https://bible.helloao.org/)
- bolls.life: online NKJV and the Greek/Hebrew dictionary (https://github.com/Bolls-Bible/bain/blob/master/docs/API.md)
- API.Bible: NKJV with the user's own key (https://api.bible/terms-and-conditions)

## Songs and user data
Wordlight reads a FreeShow song library on the user's computer (https://freeshow.app/) and never changes it. No
FreeShow code, songs, lyrics, shows, images, keys or other user data are included in this repository or the portable
package.
