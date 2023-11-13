
const express = require('express')
const cors = require('cors')
const { SQSClient, SendMessageCommand } = require('@aws-sdk/client-sqs')

require('dotenv').config()

const port = process.env.PORT || 3000
const app = express()
const sqs = new SQSClient({ region: process.env.AWS_ACCOUNT_REGION })

const sample_process = async (body) => {
  // Your logic here
  return body;
}

app.use(cors())
app.use(express.urlencoded({ extended: true }))
app.use(express.json())

app.get('/', (req, res) => {
  res.status(200).send('OK')
})

app.post('/endpoint', async (req, res) => {
  try {
    const message = await sample_process(req.body)
    await sqs.send(new SendMessageCommand({
      QueueUrl: process.env.SQS_URL,
      MessageBody: JSON.stringify(message),
    }))
    res.status(200).send('Success')
  } catch (e) {
    res.status(500).send(e.message)
  }
})

app.listen(port, () => {
  console.log(`Server started on port ${port}`)
})
