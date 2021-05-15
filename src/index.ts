require('dotenv').config()
import got from 'got'

import yaml from 'js-yaml'
import fs from 'fs'
import path from 'path'
import pino from 'pino'
import Bluebird from 'bluebird'
import Twitter from 'twitter'

interface Config {
  lang: string
  query: string
  followers_count: number
  favorite_count: number
  retweet_count: number
}

// @ts-ignore
const logger = pino({
  timestamp: pino.stdTimeFunctions.isoTime,
  prettyPrint: true,
  level: process.env.LOG_LEVEL || 'debug',
})

const createCsvWriter = require('csv-writer').createObjectCsvWriter
const csvWriter = createCsvWriter({
  path: 'output.csv',
  header: [
    { id: 'name', title: 'NAME' },
    { id: 'username', title: 'USERNAME' },
    { id: 'url', title: 'URL' },
  ],
})
const twitter_url = 'https://twitter.com'

const MAX_STEPS = 10

function createTwitterClient() {
  if (
    !process.env.TWITTER_CONSUMER_KEY ||
    !process.env.TWITTER_CONSUMER_SECRET ||
    !process.env.TWITTER_ACCESS_TOKEN_KEY ||
    !process.env.TWITTER_ACCESS_TOKEN_SECRET
  ) {
    throw 'Please set environment variables.'
  }
  return new Twitter({
    consumer_key: process.env.TWITTER_CONSUMER_KEY,
    consumer_secret: process.env.TWITTER_CONSUMER_SECRET,
    access_token_key: process.env.TWITTER_ACCESS_TOKEN_KEY,
    access_token_secret: process.env.TWITTER_ACCESS_TOKEN_SECRET,
  })
}

async function getConfig() {
  const maybeConfigPath = process.argv[2]

  if (maybeConfigPath) {
    logger.info('Using config file: %s', maybeConfigPath)
    if (maybeConfigPath.startsWith('http')) {
      const res = await got(maybeConfigPath)
      return res.body
    }
    if (maybeConfigPath.startsWith('/')) {
      return fs.readFileSync(maybeConfigPath, 'utf8')
    }
    return fs.readFileSync(path.resolve(maybeConfigPath), 'utf8')
  }
  const assumingFilePath = path.resolve(process.cwd(), 'heuristicalert.yml')
  logger.info('Using config file: %s', assumingFilePath)
  return fs.readFileSync(assumingFilePath, 'utf8')
}

async function main() {
  const current_time = new Date().getTime()
  let all_steps = 0
  let max_id = ''

  const keywords = yaml.load(await getConfig())
  logger.info('Configuration: \n%j', keywords)

  if (!Array.isArray(keywords)) {
    throw 'Wrong configuration.'
  }

  const client = createTwitterClient()
  await Bluebird.each(keywords as Config[], async (keyword) => {
    for (let step = 0; step < MAX_STEPS; step++) {
      const tweets = await client.get('search/tweets', {
        q: keyword.query,
        lang: keyword.lang,
        count: 100000,
        result_type: 'recent',
        max_id,
      })

      all_steps += tweets.statuses.length
      max_id = tweets.search_metadata.max_id_str

      logger.info(`------------------\n\n\n`)
      logger.info(`STEPS: ${all_steps}`)
      logger.info(`\n\n\n------------------`)

      await Bluebird.each(tweets.statuses, async (tweet: any) => {
        const { created_at, id_str, text, user } = tweet

        const link = `${twitter_url}/${user.screen_name}/status/${id_str}`

        // NOTE: configure tweets on your customized settings
        if (
          user.followers_count < keyword.followers_count ||
          user.favorite_count < keyword.favorite_count ||
          user.retweet_count < keyword.retweet_count
        ) {
          logger.info('Tweet does not meet conditions. skip', link)
          return
        }

        // NOTE: Calculate time diff in hours
        const tweet_time = new Date(created_at).getTime()
        const time_diff = (current_time - tweet_time) / 3600000

        // NOTE: created_at should be within 30 days
        if (time_diff > 24 * 30) {
          logger.info('The tweet is not tweeted within 30 days. skip', link)
          return
        }

        const tweet_user = await client.get('users/show', {
          screen_name: user.screen_name,
        })

        logger.info(
          `${twitter_url}/${user.screen_name}\nUser: ${user.name} tweeted a tweet about "${keyword.query}"\n${text}\nURL: ${link}\nBio: ${tweet_user.description}`,
        )

        if (true) {
          logger.info(tweet_user.description)
          await csvWriter.writeRecords([
            {
              name: user.name,
              username: user.screen_name,
              url: `https://twitter.com/${user.screen_name}`,
            },
          ])
        }
      })
    }
  })

  logger.info('Done main crawling. Waiting for the next run.')
}

export function run() {
  logger.info('Successfully scheduled Heuristic Alert')
  logger.info('Now running initial crawling')

  main()

  process.on('SIGTERM', () => {
    logger.info('Terminating Heuristic Alert')
    process.exit(0)
  })
}
