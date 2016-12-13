# flumeview-reduce

A flumeview into a reduce function.
Stream append-only log data into a reduce function to calculate a state.

## Example

``` js
var FlumeLog = require('flumelog-offset')
var codec = require('flumecodec')
var Flume = require('flumedb')
var Bloom = require('flumeview-bloom')

//initialize a flumelog with a codec.
//this example uses flumelog-offset, but any flumelog is valid.
var log = FlumeLog(file, 1024*16, codec.json) //use any flume log

//attach the reduce function.
var db = Flume(log).use('bloom', Bloom(1, 'key')

db.append({key: 1, value: 1}, function (err) {
  db.bloom.ready(function (err, stats) {
    console.log(db.bloom.has(1)) // ==> true
    conosle.log(db.bloom.has(2)) // ==> false
  })
})
```

## FlumeViewBloom(version, map, opts) => FlumeView

construct a flumeview from this reduce function. `version` should be a number,
and must be provided. If you change `map`
then increment `version` and the view will be rebuilt. Also, if any options change,
the view will be rebuilt.

`opts` provides options to the [bloom filter](https://github.com/cry/jsbloom) `items` and `probability`.
default settings are `100,000` items and `0.001` probability of a collision.

`map` is the key that is used to id each item. it can be a function that returns a string,
or if it is a string then that property is taken from the item.

## db[name].has(key) => boolean

check if an item with `key` is in the log.
If the result is `false`, then the item is _not_ in the database, but if the result is `true`,
then the item _might_ be in the database.

## Uses

### cheaply enforce uniqueness

Before adding something, check if you already have it.
If the bloom filter does not have it, then we can add it without any other checks.
But since bloom filters can give false positives, if it says yes, we need to check if it really
is there. This will be a more expensive check, but we only need to do it if the bloom check fails.

### estimating the number of unique values

By measuring the probability of a bloom filter match, we can get an estimate of the number of
unique values added to the bloom filter. For example, unique visits to your website.
This could also be used to track the how many possible values a field might have.


## License

MIT



