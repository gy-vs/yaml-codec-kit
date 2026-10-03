'use strict'

const { describe, it } = require('node:test')

const assert = require('assert')
const yaml = require('js-yaml')

describe('loadAll tolerant mode', function () {
  it('returns good documents and collects errors (array style)', function () {
    const result = yaml.loadAll('---\na: 1\n---\nb: [1,\n---\nc: 3\n', { tolerant: true })

    assert.deepStrictEqual(result.documents, [{ a: 1 }, { c: 3 }])
    assert.strictEqual(result.errors.length, 1)
    assert.strictEqual(result.errors[0].index, 1)
    assert.ok(result.errors[0].error instanceof yaml.YAMLException)
    assert.strictEqual(result.errors[0].error.reason, 'missed comma between flow collection entries')
  })

  it('delivers good documents to the iterator in stream order', function () {
    const src = '---\na: 1\n---\nb: [1,\n---\nc: 3\n---\nd: }\nx\n---\ne: 5\n'
    const received = []

    const result = yaml.loadAll(src, function (doc) { received.push(doc) }, { tolerant: true })

    assert.deepStrictEqual(received, [{ a: 1 }, { c: 3 }, { e: 5 }])
    assert.deepStrictEqual(result.documents, received)
    assert.deepStrictEqual(result.errors.map(function (entry) { return entry.index }), [1, 3])
  })

  it('recovers the document right after one with an unclosed quote', function () {
    const result = yaml.loadAll('a: "unclosed\n---\nb: 2\n', { tolerant: true })

    assert.deepStrictEqual(result.documents, [{ b: 2 }])
    assert.strictEqual(result.errors.length, 1)
    assert.strictEqual(result.errors[0].index, 0)
    assert.strictEqual(result.errors[0].error.reason, 'unexpected end of the document within a double quoted scalar')
  })

  it('recovers the document right after one with bad indentation', function () {
    const result = yaml.loadAll('---\na: 1\n  b: 2\n---\nc: 3\n', { tolerant: true })

    assert.deepStrictEqual(result.documents, [{ c: 3 }])
    assert.strictEqual(result.errors.length, 1)
    assert.strictEqual(result.errors[0].index, 0)
    assert.strictEqual(result.errors[0].error.reason, 'bad indentation of a mapping entry')
    assert.strictEqual(result.errors[0].error.mark.line, 2)
    assert.strictEqual(result.errors[0].error.mark.column, 3)
  })

  it('reports error positions relative to the whole stream', function () {
    //                            line 0: ---
    //                            line 1: a: 1
    //                            line 2: ---
    //                            line 3: b: [1,
    //                            line 4: ---      <- parser stops here, position 20
    //                            line 5: c: 3
    const result = yaml.loadAll('---\na: 1\n---\nb: [1,\n---\nc: 3\n', { tolerant: true })
    const mark = result.errors[0].error.mark

    assert.strictEqual(mark.position, 20)
    assert.strictEqual(mark.line, 4)
    assert.strictEqual(mark.column, 0)
  })

  it('counts CRLF line breaks correctly when recovering', function () {
    const result = yaml.loadAll('---\r\na: 1\r\n---\r\nb: [\r\n---\r\nc: 2\r\n', { tolerant: true })

    assert.deepStrictEqual(result.documents, [{ a: 1 }, { c: 2 }])
    assert.strictEqual(result.errors.length, 1)
    assert.strictEqual(result.errors[0].index, 1)
    assert.strictEqual(result.errors[0].error.mark.position, 22)
    assert.strictEqual(result.errors[0].error.mark.line, 4)
    assert.strictEqual(result.errors[0].error.mark.column, 0)
  })

  it('returns an empty result for an empty stream', function () {
    assert.deepStrictEqual(yaml.loadAll('', { tolerant: true }), { documents: [], errors: [] })
  })

  it('collects every broken document of the stream', function () {
    const result = yaml.loadAll('---\n[\n---\n{\n---\n"x\n', { tolerant: true })

    assert.deepStrictEqual(result.documents, [])
    assert.deepStrictEqual(result.errors.map(function (entry) { return entry.index }), [0, 1, 2])
    result.errors.forEach(function (entry) {
      assert.ok(entry.error instanceof yaml.YAMLException)
    })
  })

  it('treats directives, end markers and comment-only documents like non-tolerant mode', function () {
    const src = '%YAML 1.2\n---\na: 1\n...\n---\n# only a comment\n---\nb: 2\n'

    const expected = yaml.loadAll(src)
    const result = yaml.loadAll(src, { tolerant: true })

    assert.deepStrictEqual(result.documents, expected)
    assert.deepStrictEqual(result.documents, [{ a: 1 }, null, { b: 2 }])
    assert.deepStrictEqual(result.errors, [])
  })

  it('resumes after a document end marker that follows a broken document', function () {
    const result = yaml.loadAll('a: [1,\n...\nb: 2\n', { tolerant: true })

    assert.deepStrictEqual(result.documents, [{ b: 2 }])
    assert.strictEqual(result.errors.length, 1)
    assert.strictEqual(result.errors[0].index, 0)
  })

  it('keeps a parsed document when garbage without separator follows it', function () {
    const result = yaml.loadAll('- a\n- b\nc: 1\n---\nd: 2\n', { tolerant: true })

    assert.deepStrictEqual(result.documents, [['a', 'b'], { d: 2 }])
    assert.strictEqual(result.errors.length, 1)
    assert.strictEqual(result.errors[0].index, 1)
    assert.strictEqual(result.errors[0].error.reason, 'end of the stream or a document separator is expected')
    assert.strictEqual(result.errors[0].error.mark.line, 2)
  })

  it('resets the nesting depth after a broken document', function () {
    const src = '['.repeat(150) + '\n---\nok: 1\n'
    const result = yaml.loadAll(src, { tolerant: true })

    assert.deepStrictEqual(result.documents, [{ ok: 1 }])
    assert.strictEqual(result.errors.length, 1)
    assert.strictEqual(result.errors[0].index, 0)
    assert.strictEqual(result.errors[0].error.reason, 'nesting exceeded maxDepth (100)')
  })

  it('works together with the json option', function () {
    const src = '---\n{"a": 1, "a": 2}\n'

    const strict = yaml.loadAll(src, { tolerant: true })
    assert.deepStrictEqual(strict.documents, [])
    assert.strictEqual(strict.errors[0].error.reason, 'duplicated mapping key')

    const json = yaml.loadAll(src, { tolerant: true, json: true })
    assert.deepStrictEqual(json.documents, [{ a: 2 }])
    assert.deepStrictEqual(json.errors, [])
  })

  it('works together with the schema option', function () {
    const src = '---\n0x10\n'

    assert.deepStrictEqual(yaml.loadAll(src, { tolerant: true }).documents, [16])
    assert.deepStrictEqual(
      yaml.loadAll(src, { tolerant: true, schema: yaml.FAILSAFE_SCHEMA }).documents,
      ['0x10']
    )
  })

  it('works together with the filename option', function () {
    const result = yaml.loadAll('---\nb: [1,\n', { tolerant: true, filename: 'batch.yml' })

    assert.strictEqual(result.errors.length, 1)
    assert.strictEqual(result.errors[0].error.mark.name, 'batch.yml')
  })

  it('supports the loadAll(input, null, options) call form', function () {
    const result = yaml.loadAll('---\na: 1\n---\nb: [1,\n', null, { tolerant: true })

    assert.deepStrictEqual(result.documents, [{ a: 1 }])
    assert.strictEqual(result.errors.length, 1)
    assert.strictEqual(result.errors[0].index, 1)
  })

  it('rethrows errors that are not YAMLExceptions', function () {
    assert.throws(function () {
      yaml.loadAll('%YAML 1.3\n---\na\n', {
        tolerant: true,
        onWarning: function () { throw new TypeError('boom') }
      })
    }, TypeError)
  })

  it('is off by default and reports the same first error as tolerant mode', function () {
    const src = '---\na: 1\n---\nb: [1,\n---\nc: 3\n'
    let thrown = null

    assert.throws(function () { yaml.loadAll(src) }, yaml.YAMLException)
    try { yaml.loadAll(src) } catch (error) { thrown = error }

    const result = yaml.loadAll(src, { tolerant: true })

    assert.strictEqual(result.errors[0].error.message, thrown.message)
    assert.strictEqual(result.errors[0].error.reason, thrown.reason)
    assert.strictEqual(result.errors[0].error.mark.position, thrown.mark.position)
    assert.strictEqual(result.errors[0].error.mark.line, thrown.mark.line)
    assert.strictEqual(result.errors[0].error.mark.column, thrown.mark.column)
  })

  it('leaves loadAll and load behavior unchanged without the option', function () {
    const docs = yaml.loadAll('---\na: 1\n---\nb: 2\n')
    assert.ok(Array.isArray(docs))
    assert.deepStrictEqual(docs, [{ a: 1 }, { b: 2 }])

    assert.strictEqual(yaml.load('a: 1').a, 1)
    assert.throws(function () { yaml.load('a: [1,') }, yaml.YAMLException)
    assert.throws(function () { yaml.load('a: [1,', { tolerant: true }) }, yaml.YAMLException)
    assert.throws(function () { yaml.loadAll('a: [1,') }, yaml.YAMLException)
  })
})
