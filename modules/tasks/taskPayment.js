const Promise = require('bluebird')
const models = require('../../loading/loading')
const TransferMail = require('../mail/transfer')

const Stripe = require('stripe')
const stripe = new Stripe(process.env.STRIPE_KEY)

module.exports = Promise.method(function taskPayment (payment) {
  return models.Task
    .findOne({
      where: {
        id: payment.taskId
      }
    },
    { include: [ models.User, models.Order, models.Assign ] }
    )
    .then(task => {
      if (!task) {
        throw new Error('find_task_error')
      }

      return models.Assign.findOne({
        where: {
          id: task.assigned
        },
        include: [ models.User ]
      }).then(assign => {
        const user = assign.dataValues.User.dataValues
        const transferGroup = `task_${task.id}`
        const dest = user.account_id
        if (!dest) {
          throw new Error('account_destination_invalid')
        }

        return stripe.transfers.create({
          amount: task.value * 100,
          currency: 'usd',
          destination: dest,
          source_type: 'card',
          transfer_group: transferGroup,
        }).then(transfer => {
          // eslint-disable-next-line no-console
          console.log('transfer')
          // eslint-disable-next-line no-console
          console.log(transfer)

          if (transfer) {
            return models.Task.update({ paid: true, transfer_id: transfer.id }, {
              where: {
                id: task.id
              }
            }).then(update => {
              if (!update) {
                TransferMail.error(user.email, task, task.value)
                throw new Error('update_task_reject')
              }
              TransferMail.success(user.email, task, task.value)
              return transfer
            })
          }
        })
      })
    })
})