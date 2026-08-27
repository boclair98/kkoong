# Third-party data notices

## Korean dictionary data

`src/main/resources/words-ko.txt` is a mechanically filtered list derived from
[`spellcheck-ko/hunspell-dict-ko`](https://github.com/spellcheck-ko/hunspell-dict-ko),
which includes dictionary data from the National Institute of Korean Language.

- Upstream revision: `606164264399ca037325bd41750f9c108ed4c290`
- Transformation: keep unique, Hangul-only nouns containing 2–4 syllables
- Dictionary-data license: GNU General Public License version 3 or later
- Upstream authorship and data-source details remain with the original project

The dictionary is loaded as a separate data work by the Spring application.
The complete license text is included at
`third-party/hunspell-dict-ko/LICENSE.GPL-3.0.txt` and is also embedded in the
application JAR under `META-INF/licenses/`.
