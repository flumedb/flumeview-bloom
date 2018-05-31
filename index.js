var Obv = require('obv')
var Drain = require('pull-stream/sinks/drain')
var Once = require('pull-stream/sources/once')
var AtomicFile = require('atomic-file')
var path = require('path')
var jsbloom = require('jsbloom')

function isEmpty (o) {
  for(var k in o) return false
  return true
}

function isFunction (f) {
  return 'function' === typeof f
}

function isString (s) {
  return 'string' === typeof s
}

var codec = require('./codec')

function lookup(map) {
  if(isFunction(map)) return map
  else if(isString(map)) return function (obj) { return obj[map] }
  else return function (e) { return e }
}

module.exports = function (version, map, opts) {
  opts = opts || {}
  var items = opts.items || 100e3
  var probability = opts.probability || 0.001

  if(isFunction(version))
    throw new Error('version must be a number')

  map = lookup(map)
  return function (log, name) { //name is where this view is mounted
    var acc, since = Obv(), ts = 0
    var value = Obv(), _value, writing = false, state, int

    function write () {
      var _ts = Date.now()
      if(state && since.value === log.since.value && _ts > ts + 60*1000 && !writing) {
        clearTimeout(int)
        int = setTimeout(function () {
          ts = _ts; writing = true
          state.set({
            seq: since.value,
            version: version,
            items: items,
            probability: probability,
            value: bloom
          }, function () {
            writing = false
          })
        }, 200)
      }
    }

    //depending on the function, the reduction may not change on every update.
    //but currently, we still need to rewrite the file to reflect that.
    //(or accept that we'll have to reprocess some items)
    //might be good to have a cheap way to update the seq. maybe put it in the filename,
    //so filenames monotonically increase, instead of write to `name~` and then `mv name~ name`

    if(log.filename) {
      var dir = path.dirname(log.filename)
      state = AtomicFile(path.join(dir, name+'.json'), codec)
      state.get(function (err, data) {
        if(err || isEmpty(data)) {
          bloom = jsbloom.filter(opts.items || 100e3, opts.probability || 0.001)
          since.set(-1)
        }
        else if( //if any settings have changed, reinitialize the filter.
          data.version !== version
        || data.items !== opts.items
        || data.probabilty !== opts.probability
      ) {
          bloom = jsbloom.filter(opts.items || 100e3, opts.probability || 0.001)
          since.set(-1) //overwrite old data.
        }
        else {
          bloom = data.value
          since.set(data.seq)
        }
      })
    }
    else
      since.set(-1)

    return {
      since: since,
      value: value,
      methods: {has: 'sync'},
      //has checks immediately, but if you want to wait
      //use db[name].ready(function () { db[name].has(key) })
      //ready is added by flumedb
      has: function (key) {
        return bloom.checkEntry(key)
      },
      createSink: function (cb) {
        return Drain(function (data) {
          var key = map(data.value, data.seq)
          if(key) bloom.addEntry(key)
          since.set(data.seq)
          write()
        }, cb)
      },
      destroy: function (cb) {
        bloom = null; since.set(-1);
        if(state) state.set(null, cb)
        else cb()
      },
      close: function (cb) {
        clearTimeout(int)
        if(!since.value) return cb()
        //force a write.
        state.set({
          seq: since.value,
          version: version,
          items: opts.items,
          probability: opts.probability,
          value: bloom
        }, cb)
      }
    }
  }
}

