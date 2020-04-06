import React from 'react';
import Cookies from 'universal-cookie';
import axios from 'axios';
import './App.css';
import ConsoleOutput from './ConsoleOutput';
import CDriveSave from './CDriveSave';
import CDrivePathSelector from './CDrivePathSelector';

class App extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      specs: {},
      isLoggedIn: false,
      aPath: "",
      aPathSelector: false,
      bPath: "",
      bPathSelector: false,
      cPath: "",
      cPathSelector: false,
      nC: "",
      containerUrl: "",
      replicas: "",
      uid: "",
      fnStatus: "",
      fnMessage: "",
      fnStart: "",
      fnElapsed: "",
      logsAvailable: false,
      logsPage: false,
      completePage: false,
      driveObjects: []
    };
    this.getSpecs = this.getSpecs.bind(this);
    this.authenticateUser = this.authenticateUser.bind(this);
    this.getDriveObjects = this.getDriveObjects.bind(this);
    this.startBlockFn = this.startBlockFn.bind(this);
    this.stopBlockFn = this.stopBlockFn.bind(this);
    this.fnStatusPoll = this.fnStatusPoll.bind(this);
  }
  getSpecs() {
    const request = axios({
      method: 'GET',
      url: `${window.location.protocol}//${window.location.hostname}${window.location.pathname}api/specs`
    });
    request.then(
      response => {
        this.setState({specs: response.data});
      },
    );
  }
  authenticateUser() {
    const cookies = new Cookies();
    var accessToken = cookies.get('fgen_token');
    if (accessToken !== undefined) {
      this.getDriveObjects().then(driveObjects => this.setState({driveObjects: driveObjects}));
      this.setState({isLoggedIn: true});
      return;
    }
    var url = new URL(window.location.href);
    var code = url.searchParams.get("code");
    var redirect_uri = `${this.state.specs.cdriveUrl}app/${this.state.specs.username}/feature-vector-generator/`;
    if (code == null) {
      window.location.href = `${this.state.specs.authUrl}o/authorize/?response_type=code&client_id=${this.state.specs.clientId}&redirect_uri=${redirect_uri}&state=1234xyz`;
    } else {
      const request = axios({
        method: 'POST',
        url: `${redirect_uri}api/access-token`,
        data: {
          code: code,
          redirect_uri: redirect_uri
        }
      });
      request.then(
        response => {
          cookies.set('fgen_token', response.data.access_token);
          window.location.href = redirect_uri;
        }, err => {
        }
      );
    }
  }
  getDriveObjects() {
    return new Promise(resolve => {
      const cookies = new Cookies();
      var auth_header = 'Bearer ' + cookies.get('fgen_token');
      const request = axios({
        method: 'GET',
        url: this.state.specs.cdriveApiUrl + "list-recursive/?path=users",
        headers: {'Authorization': auth_header}
      });
      request.then(
        response => {
          resolve(response.data.driveObjects);
        }, err => {
          if(err.response.status === 401) {
            cookies.remove('fgen_token');
            window.location.reload(false);
          } else {
            resolve([]);
          }
        }
      );
    });
  }
  startBlockFn() {
    this.setState({
      fnStatus: "Running",
      fnMessage: "Processing inputs",
      fnStart: Date.now(),
      fnElapsed: "0s"
    });
    const cookies = new Cookies();
    const request = axios({
      method: 'POST',
      url: `${this.state.specs.cdriveUrl}app/${this.state.specs.username}/feature-vector-generator/api/generate`,
      data: {
        aPath: this.state.aPath,
        bPath: this.state.bPath,
        cPath: this.state.cPath,
        nC: this.state.nC,
        containerUrl: this.state.containerUrl,
        replicas: this.state.replicas,
      },
      headers: {
        'Authorization': `Bearer ${cookies.get('fgen_token')}`,
      }
    });
    request.then(
      response => {
        this.setState({ 
          uid: response.data.uid
        });
        setTimeout(() => this.fnStatusPoll(), 500);
      },
    );
  }
  stopBlockFn() {
    const cookies = new Cookies();
    axios({
      method: 'POST',
      url: `${this.state.specs.cdriveUrl}app/${this.state.specs.username}/feature-vector-generator/api/abort`,
      data: {
        uid: this.state.uid,
      },
      headers: {
        'Authorization': `Bearer ${cookies.get('fgen_token')}`,
      }
    });
  }
  fnStatusPoll() {
    const request = axios({
      method: 'GET',
      url: `${this.state.specs.cdriveUrl}app/${this.state.specs.username}/feature-vector-generator/api/status?uid=${this.state.uid}`
    });
    request.then(
      response => {
        var elapsedSecs = Math.floor((Date.now()-this.state.fnStart)/1000);
        this.setState({
          fnStatus: response.data.fnStatus,
          fnMessage: response.data.fnMessage,
          fnElapsed: `${Math.floor(elapsedSecs/60)}m ${elapsedSecs % 60}s`
        });
        if (response.data.logsAvailable === "Y") {
          this.setState({logsAvailable:true});
        }
        if(response.data.fnStatus === "Running") {
          setTimeout(() => this.fnStatusPoll(), 1000);
        }
      }, err => {
        setTimeout(() => this.fnStatusPoll(), 1000);
      }
    );
  }
  render() {
    if (Object.keys(this.state.specs).length === 0) {
      this.getSpecs();
      return (null);
    } else if (!this.state.isLoggedIn) {
      this.authenticateUser();
      return (null);
    } else if(this.state.logsPage) {
      return (
        <ConsoleOutput toggle={() => this.setState({logsPage: false})} specs={this.state.specs} uid={this.state.uid} replicas={this.state.replicas}/>
      );
    } else if(this.state.completePage) {
      return (
        <CDriveSave toggle={() => this.setState({completePage: false})} specs={this.state.specs} uid={this.state.uid} driveObjects={this.state.driveObjects}/>
      );
    } else {
      let aPath, bPath, cPath;
      function getName(cDrivePath) {
        if (cDrivePath === "") {
          return ""
        }
        return cDrivePath.substring(cDrivePath.lastIndexOf("/") + 1);
      }
      aPath = getName(this.state.aPath);
      bPath = getName(this.state.bPath);
      cPath = getName(this.state.cPath);
      let blockButton, abortButton;
      if(this.state.fnStatus === "Running") {
        blockButton = (
          <button className="btn btn-lg btn-primary blocker-btn" disabled={true}>
            Execute
          </button>
        );
        abortButton = (
          <button className="btn btn-lg btn-secondary blocker-btn" onClick={this.stopBlockFn}>
            Abort
          </button>
        );
      } else {
        blockButton = (
          <button className="btn btn-lg btn-primary blocker-btn" onClick={this.startBlockFn}>
            Execute
          </button>
        );
        abortButton = (
          <button className="btn btn-lg btn-secondary blocker-btn" disabled={true}>
            Abort
          </button>
        );
      }
      let statusClasses, actionButton, statusContainer;
      if(this.state.fnStatus !==  "") {
        if(this.state.fnStatus === "Complete") {
          actionButton = (
            <button className="btn btn-primary btn-sm ml-2" onClick={() => this.setState({completePage: true})}>
              <span className="h5 font-weight-normal">View Output</span>
            </button>
          );
          statusClasses = "h5 font-weight-normal";
        } else if(this.state.fnStatus === "Error") {
          if (this.state.logsAvailable) {
            actionButton = (
              <button className="btn btn-danger btn-sm ml-2" onClick={() => this.setState({logsPage: true})}>
                <span className="h5 font-weight-normal">View Logs</span>
              </button>
            );
          }
          statusClasses = "h5 font-weight-normal text-danger";
        } else {
          statusClasses = "h5 font-weight-normal";
        }
        statusContainer = (
          <div className="blocker-status">
            <span className={statusClasses}>{this.state.fnStatus} : {this.state.fnMessage}, Elapsed time: {this.state.fnElapsed}</span>
            {actionButton}
          </div>
        );
      }
      return(
        <div className="app-container">
          <div className="app-header">
            Feature Vector Generator
          </div>
          <CDrivePathSelector show={this.state.aPathSelector} toggle={() => this.setState({aPathSelector : false})}
          action={path => this.setState({aPath: path})} title="Select CDrive Path to Table A"  actionName="Select"
          driveObjects={this.state.driveObjects} type="file" />
          <CDrivePathSelector show={this.state.bPathSelector} toggle={() => this.setState({bPathSelector : false})}
          action={path => this.setState({bPath: path})} title="Select CDrive Path to Table B"  actionName="Select"
          driveObjects={this.state.driveObjects} type="file" />
          <CDrivePathSelector show={this.state.cPathSelector} toggle={() => this.setState({cPathSelector : false})}
          action={path => this.setState({cPath: path})} title="Select CDrive Path to Table C"  actionName="Select"
          driveObjects={this.state.driveObjects} type="file" />
          <table className="mx-auto">
            <tr>
              <td>
                <span className="m-3">Table A:</span>
                <button className="btn btn-secondary m-3" onClick={() => this.setState({aPathSelector : true})} >
                  Browse
                </button>
                <span className="m-3">{aPath}</span>
              </td>
              <td colSpan={2} className="cdrive-input-item">
                <span className="m-3">Table B:</span>
                <button className="btn btn-secondary m-3" onClick={() => this.setState({bPathSelector : true})} >
                  Browse
                </button>
                <span className="m-3">{bPath}</span>
              </td>
            </tr>
            <tr>
              <td>
                <span className="m-3">Table C:</span>
                <button className="btn btn-secondary m-3" onClick={() => this.setState({cPathSelector : true})} >
                  Browse
                </button>
                <span className="m-3">{cPath}</span>
              </td>
              <td>
                <span className="m-3">No of chunks:</span>
              </td>
              <td>
                <input type="text" value={this.state.nC} className="p-1 m-3 number-input" onChange={e => this.setState({nC: e.target.value})} />
              </td>
            </tr>
            <tr>
              <td>
                <input type="text" placeholder="Container URL" value={this.state.containerUrl} className="p-2 m-3 cdrive-input-item"
                  onChange={e => this.setState({containerUrl: e.target.value})} />
              </td>
              <td>
                <span className="m-3">No of Replicas:</span>
              </td>
              <td>
                <input type="text" value={this.state.replicas} className="p-1 m-3 number-input"
                  onChange={e => this.setState({replicas: e.target.value})} />
              </td>
            </tr>
            <tr>
              <td colSpan={3}>
                <div className="input-div text-center">
                  {blockButton}
                  {abortButton}
                </div>
              </td>
            </tr>
          </table>
          {statusContainer}
        </div>
      );
    }
  }
}

export default App;
