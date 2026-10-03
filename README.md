# js-yaml

Run tests: `npm run test:core`

## `loadAll` tolerant mode

`loadAll(input, [iterator], { tolerant: true })` skips documents that fail to parse instead of throwing: it returns `{ documents, errors }`, where `documents` are the successfully parsed documents (also passed to the iterator in stream order) and `errors` collects one `{ documentIndex, error }` entry per failed document — `documentIndex` is the 0-based index of the document in the stream and `error` is the original `YAMLException` whose line/column mark points into the whole stream.
