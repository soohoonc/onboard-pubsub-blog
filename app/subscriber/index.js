const {
  SQSClient,
  ReceiveMessageCommand,
  DeleteMessageCommand,
} = require('@aws-sdk/client-sqs')
const OpenAI = require('openai')
const express = require('express')

require('dotenv').config()

const app = express()
const PORT = process.env.PORT || 3000

const sqs = new SQSClient({ region: process.env.AWS_ACCOUNT_REGION })
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

app.get('/', (req, res) => {
  res.status(200).send('OK')
})

app.listen(PORT, () => {
  console.log(`Server started on port: ${PORT}`)
  main()
})

const sample_process = async (messages) => {
  // sample llms processing with openai
  const results = await Promise.allSettled(
    messages.map(async (message) => {
      const body = JSON.parse(message.Body)
      const messages = [
        {
          role: 'system',
          content: '<YOUR SYSTEM PROMPT>'
        },
        {
          role: 'user',
          content: body
        },
      ]
      const response = await openai.chat.completions.create({
        model: process.env.OPENAI_MODEL,
        messages,
      })
      return response
    })
  )
  return results
}

async function main() {
  while (true) { // Poll the SQS queue
    try {
      const receiveParams = {
        QueueUrl: process.env.SQS_URL,
        MaxNumberOfMessages: 10, // SQS Max
        VisibilityTimeout: 60, 
        WaitTimeSeconds: 10, // for long polling
      }
      const data = await sqs.send(
        new ReceiveMessageCommand(receiveParams)
      )
      if (data.Messages && data.Messages.length > 0) {
        const receiptHandles = data.Messages.map((message) => message.ReceiptHandle)
        const results = await sample_process(data.Messages)
        await sqs.send(
          new DeleteMessageCommand({
            QueueUrl: process.env.SQS_URL,
            ReceiptHandle: receiptHandles
          }))
        console.log(results);
      }
    } catch (err) {
      console.log(err)
      process.exit(1); // included to prevent infinite loop when running locally without SQS_URL defined
    }
  }
}