'use strict'

const { describe, it } = require('node:test')

const assert = require('assert')
const yaml = require('js-yaml')

describe('loadAll tolerant mode', function () {
  it('returns every document and no errors for a valid stream', function () {
    const input = '%YAML 1.2\n---\na: 1\n...\n---\n# only a comment\n---\n- 1\n- 2\n'
    const expected = yaml.loadAll(input)

    assert.deepStrictEqual(expected, [{ a: 1 }, null, [1, 2]])

    const result = yaml.loadAll(input, { tolerant: true })

    assert.deepStrictEqual(result.documents, expected)
    assert.deepStrictEqual(result.errors, [])
  })

  it('returns an empty result for an empty stream', function () {
    assert.deepStrictEqual(yaml.loadAll('', { tolerant: true }), { documents: [], errors: [] })
  })

  it('skips a broken document and collects its error', function () {
    const input = 'a: 1\n---\nb: [1, 2\n---\nc: 3\n'
    const result = yaml.loadAll(input, { tolerant: true })

    assert.deepStrictEqual(result.documents, [{ a: 1 }, { c: 3 }])
    assert.strictEqual(result.errors.length, 1)
    assert.deepStrictEqual(Object.keys(result.errors[0]).sort(), ['documentIndex', 'error'])
    assert.strictEqual(result.errors[0].documentIndex, 1)
    assert.ok(result.errors[0].error instanceof yaml.YAMLException)
    assert.strictEqual(result.errors[0].error.reason, 'missed comma between flow collection entries')
  })

  it('recovers the document immediately after one with an unclosed double quote', function () {
    const input = 'a: 1\n---\nb: "unclosed\n---\nc: 3\n'
    const result = yaml.loadAll(input, { tolerant: true })

    assert.deepStrictEqual(result.documents, [{ a: 1 }, { c: 3 }])
    assert.strictEqual(result.errors.length, 1)
    assert.strictEqual(result.errors[0].documentIndex, 1)
    assert.strictEqual(result.errors[0].error.reason, 'unexpected end of the document within a double quoted scalar')
  })

  it('recovers the document immediately after one with an unclosed single quote', function () {
    const input = "a: 1\n---\nb: 'unclosed\n---\nc: 3\n"
    const result = yaml.loadAll(input, { tolerant: true })

    assert.deepStrictEqual(result.documents, [{ a: 1 }, { c: 3 }])
    assert.strictEqual(result.errors.length, 1)
    assert.strictEqual(result.errors[0].documentIndex, 1)
    assert.strictEqual(result.errors[0].error.reason, 'unexpected end of the document within a single quoted scalar')
  })

  it('recovers the document immediately after one with bad indentation', function () {
    const input = 'a: 1\n---\nb: 2\n  c: 3\n---\nd: 4\n'
    const result = yaml.loadAll(input, { tolerant: true })

    assert.deepStrictEqual(result.documents, [{ a: 1 }, { d: 4 }])
    assert.strictEqual(result.errors.length, 1)
    assert.strictEqual(result.errors[0].documentIndex, 1)
    assert.strictEqual(result.errors[0].error.reason, 'bad indentation of a mapping entry')
  })

  it('drops the content of a document with trailing garbage', function () {
    const input = 'a: 1\n---\n"x" y\n---\nb: 2\n'
    const result = yaml.loadAll(input, { tolerant: true })

    assert.deepStrictEqual(result.documents, [{ a: 1 }, { b: 2 }])
    assert.strictEqual(result.errors.length, 1)
    assert.strictEqual(result.errors[0].documentIndex, 1)
    assert.strictEqual(result.errors[0].error.reason, 'end of the stream or a document separator is expected')
  })

  it('skips several broken documents in a row', function () {
    const input = 'ok: 0\n---\nbad: [1\n---\nbad2: "x\n---\nok2: 1\n'
    const result = yaml.loadAll(input, { tolerant: true })

    assert.deepStrictEqual(result.documents, [{ ok: 0 }, { ok2: 1 }])
    assert.strictEqual(result.errors.length, 2)
    assert.strictEqual(result.errors[0].documentIndex, 1)
    assert.strictEqual(result.errors[1].documentIndex, 2)
  })

  it('handles a broken first document', function () {
    const result = yaml.loadAll('bad: [1\n---\nok: 1\n', { tolerant: true })

    assert.deepStrictEqual(result.documents, [{ ok: 1 }])
    assert.strictEqual(result.errors.length, 1)
    assert.strictEqual(result.errors[0].documentIndex, 0)
  })

  it('handles a broken last document', function () {
    const result = yaml.loadAll('ok: 1\n---\nbad: [1\n', { tolerant: true })

    assert.deepStrictEqual(result.documents, [{ ok: 1 }])
    assert.strictEqual(result.errors.length, 1)
    assert.strictEqual(result.errors[0].documentIndex, 1)
  })

  it('recovers after a document terminated by an end marker', function () {
    const input = 'a: 1\n...\nb: "unclosed\n...\nc: 3\n'
    const result = yaml.loadAll(input, { tolerant: true })

    assert.deepStrictEqual(result.documents, [{ a: 1 }, { c: 3 }])
    assert.strictEqual(result.errors.length, 1)
    assert.strictEqual(result.errors[0].documentIndex, 1)
  })

  it('reports error positions relative to the whole stream', function () {
    const input = 'r: 0\n---\nr: 1\n---\nr: 2\n---\nbroken: [9\n---\nr: 4\n'
    const result = yaml.loadAll(input, { tolerant: true })

    assert.strictEqual(result.errors.length, 1)
    assert.strictEqual(result.errors[0].documentIndex, 3)
    // the unclosed flow collection runs into the '---' on line 8 (1-based)
    assert.strictEqual(result.errors[0].error.mark.line, 7)
    assert.strictEqual(result.errors[0].error.mark.column, 0)
  })

  it('collects the same error that non-tolerant mode throws', function () {
    const input = 'bad: [1\n---\nok: 1\n'
    let thrown = null

    try {
      yaml.loadAll(input)
    } catch (error) {
      thrown = error
    }

    const result = yaml.loadAll(input, { tolerant: true })

    assert.ok(thrown instanceof yaml.YAMLException)
    assert.strictEqual(result.errors.length, 1)
    assert.strictEqual(result.errors[0].error.message, thrown.message)
  })

  it('calls the iterator with good documents in stream order', function () {
    const input = 'g: 0\n---\nbad: [\n---\ng: 2\n---\nbad: {\n---\ng: 4\n'
    const seen = []
    const result = yaml.loadAll(input, function (doc) { seen.push(doc) }, { tolerant: true })

    assert.deepStrictEqual(seen, [{ g: 0 }, { g: 2 }, { g: 4 }])
    assert.deepStrictEqual(result.documents, seen)
    assert.strictEqual(result.errors.length, 2)
    assert.strictEqual(result.errors[0].documentIndex, 1)
    assert.strictEqual(result.errors[1].documentIndex, 3)
  })

  it('supports loadAll(input, null, options)', function () {
    const result = yaml.loadAll('a: 1\n---\nb: [\n', null, { tolerant: true })

    assert.deepStrictEqual(result.documents, [{ a: 1 }])
    assert.strictEqual(result.errors.length, 1)
    assert.strictEqual(result.errors[0].documentIndex, 1)
  })

  it('keeps document indexes of a record stream with one broken record', function () {
    const input = 'id: 0\nname: rec0\n---\nid: 1\nname: rec1\n---\nid: 2\nname: "rec2\n---\n' +
      'id: 3\nname: rec3\n---\nid: 4\nname: rec4\n'
    const result = yaml.loadAll(input, { tolerant: true })

    assert.deepStrictEqual(result.documents, [
      { id: 0, name: 'rec0' },
      { id: 1, name: 'rec1' },
      { id: 3, name: 'rec3' },
      { id: 4, name: 'rec4' }
    ])
    assert.strictEqual(result.errors.length, 1)
    assert.strictEqual(result.errors[0].documentIndex, 2)
  })

  it('works together with the json option', function () {
    // duplicate keys are allowed in json mode, so the first document parses
    const input = 'a: 1\na: 2\n---\nb: [\n---\nc: 3\n'
    const result = yaml.loadAll(input, { json: true, tolerant: true })

    assert.deepStrictEqual(result.documents, [{ a: 2 }, { c: 3 }])
    assert.strictEqual(result.errors.length, 1)
    assert.strictEqual(result.errors[0].documentIndex, 1)
  })

  it('collects a duplicated mapping key error in default mode', function () {
    const input = 'a: 1\na: 2\n---\nb: 3\n'
    const result = yaml.loadAll(input, { tolerant: true })

    assert.deepStrictEqual(result.documents, [{ b: 3 }])
    assert.strictEqual(result.errors.length, 1)
    assert.strictEqual(result.errors[0].documentIndex, 0)
    assert.strictEqual(result.errors[0].error.reason, 'duplicated mapping key')
  })

  it('works together with the schema option', function () {
    const result = yaml.loadAll('a: yes\n---\nb: 2\n', { schema: yaml.JSON_SCHEMA, tolerant: true })

    assert.deepStrictEqual(result.documents, [{ a: 'yes' }, { b: 2 }])
    assert.deepStrictEqual(result.errors, [])
  })

  it('works together with the filename option', function () {
    const result = yaml.loadAll('a: [1\n', { filename: 'records.yml', tolerant: true })

    assert.deepStrictEqual(result.documents, [])
    assert.strictEqual(result.errors.length, 1)
    assert.strictEqual(result.errors[0].error.mark.name, 'records.yml')
    assert.ok(result.errors[0].error.message.indexOf('records.yml') !== -1)
  })

  it('rethrows errors that are not YAMLException', function () {
    const explodingType = new yaml.Type('!explode', {
      kind: 'scalar',
      resolve: function () { return true },
      construct: function () { throw new TypeError('boom') }
    })
    const schema = yaml.DEFAULT_SCHEMA.extend([explodingType])

    assert.throws(function () {
      yaml.loadAll('!explode x\n---\ny: 1\n', { tolerant: true, schema: schema })
    }, TypeError)
  })

  it('does not change loadAll and load behavior when the option is off', function () {
    const broken = 'a: [1\n---\nb: 2\n'

    assert.throws(function () { yaml.loadAll(broken) }, yaml.YAMLException)
    assert.throws(function () { yaml.loadAll(broken, { tolerant: false }) }, yaml.YAMLException)
    assert.throws(function () { yaml.loadAll(broken, function () {}) }, yaml.YAMLException)
    assert.throws(function () { yaml.load(broken) }, yaml.YAMLException)
    assert.throws(function () { yaml.load(broken, { tolerant: true }) }, yaml.YAMLException)

    assert.deepStrictEqual(yaml.loadAll('a: 1\n---\nb: 2\n'), [{ a: 1 }, { b: 2 }])
    assert.deepStrictEqual(yaml.load('a: 1'), { a: 1 })
    assert.deepStrictEqual(yaml.load('a: 1', { tolerant: true }), { a: 1 })
  })
})
