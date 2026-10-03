# js-yaml

Run tests: `npm run test:core`

## `loadAll` tolerant mode

`loadAll` accepts a `tolerant` option (off by default): with `yaml.loadAll(input, { tolerant: true })` a document that fails to parse no longer aborts the whole stream — the call returns `{ documents, errors }` where `documents` holds every successfully parsed document in stream order (also passed to the iterator, if one is given) and `errors` holds one `{ index, error }` entry per failed document with its 0-based index in the stream and the original `YAMLException` whose line/column point at the position in the original stream.
