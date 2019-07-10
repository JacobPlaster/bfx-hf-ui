import React from 'react'
import { Spinner, Intent } from '@blueprintjs/core'
import { Route } from 'react-router-dom'
import _isEmpty from 'lodash/isEmpty'

import APIComboDialog from '../APIComboDialog'
import SideNavBar from '../../ui/SideNavBar'
import StatusBar from '../../ui/StatusBar'
import AlgoOrdersView from '../../pages/AlgoOrders'
import DashboardView from '../../pages/Dashboard'

export default class HFUI extends React.Component {
  constructor(props) {
    super(props)

    this.onSubmitKeys = this.onSubmitKeys.bind(this)
  }

  componentDidMount () {
    const { loadInitialSettings, loadAPIKey, cycleBFXConnection } = this.props

    loadInitialSettings()
    loadAPIKey()
    cycleBFXConnection()
  }

  onSubmitKeys({ key, secret } = {}) {
    const { submitAPIKey } = this.props
    submitAPIKey({ key, secret })
  }

  render() {
    const { apiKeyCombo = {} } = this.props

    if (_isEmpty(apiKeyCombo)) {
      return (
        <div className='bp3-dark hfui loading'>
          <Spinner
            intent={Intent.PRIMARY}
            size={Spinner.SIZE_LARGE}
          />
        </div>
      )
    }

    const { key, secret } = apiKeyCombo

    if (!key || !secret) {
      return (
        <div className='bp3-dark hfui'>
          <APIComboDialog
            onSubmit={this.onSubmitKeys}
          />
        </div>
      )
    }

    /*
      <Route exact path='/index.html' component={DashboardView} />  used for an electron app
    */
    return (
      <div className='hfui'>
        <div className='hfui_content__wrapper'>
          <Route component={SideNavBar} />
          <Route exact path='/' component={DashboardView} />
          <Route exact path='/index.html' component={DashboardView} /> 
          <Route path='/algo-orders' component={AlgoOrdersView} />
        </div>

        <Route component={StatusBar} />
      </div>
    )
  }
}
