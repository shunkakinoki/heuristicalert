require('dotenv').config();
var Twitter = require('twitter')

var client = new Twitter({
  consumer_key: process.env.TWITTER_CONSUMER_KEY,
  consumer_secret: process.env.TWITTER_CONSUMER_SECRET,
  access_token_key: process.env.TWITTER_ACCESS_TOKEN_KEY,
  access_token_secret: process.env.TWITTER_ACCESS_TOKEN_SECRET
});

var current_time = new Date().getTime()

client.get('search/tweets', {q: 'hello', count: 2, result_type: "recent", exclude: "retweets"}, function(error, tweets) {
  if(!error) {
    var { statuses } = tweets
    statuses.forEach(tweet => {
      // NOTE: created_at should be within 1 hour
      var tweet_time = new Date(tweet.created_at).getTime()
      var time_diff = (current_time - tweet_time) / 3600000
      if(time_diff > 1) return
    })
  }
});