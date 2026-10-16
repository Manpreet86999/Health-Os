import { Component, type ErrorInfo, type ReactNode } from 'react';
import { signOutCloud } from '../lib/cloud-session';
import { APP_VERSION } from '../../shared/version';

interface Props {
  children: ReactNode;
  section?: string;
  onHome?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  componentStack: string;
  copied: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    componentStack: '',
    copied: false,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, componentStack:'', copied:false };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error caught by ErrorBoundary:', error, errorInfo);
    this.setState({componentStack:errorInfo.componentStack || ''});
  }

  private diagnostics = () => JSON.stringify({version:APP_VERSION,
    build:(window as Window & {__HEALTH_OS_ANDROID_BUILD__?:number}).__HEALTH_OS_ANDROID_BUILD__,
    route:location.hash,section:this.props.section || 'Application',
    message:this.state.error?.message,componentStack:this.state.componentStack},null,2);

  private openToday = () => {
    if(this.props.onHome){this.props.onHome();return;}
    // Only navigation preferences change; account records and drafts stay in place.
    localStorage.setItem('body-os-workspace','workout');
    localStorage.setItem('body-os-last-workout-page','Today');
    location.hash='#Today';
    this.setState({hasError:false,error:null,componentStack:'',copied:false});
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className={this.props.section?'view-error':'unlock-screen'} role="alert" style={{ display: 'grid', placeItems: 'center', minHeight: this.props.section?0:'100vh', padding: 20, minWidth:0 }}>
          <div className="glass card stack text-center" style={{ maxWidth: 480, width:'100%', margin: 'auto', minWidth:0 }}>
            <h2 style={{ color: 'var(--danger)', margin: '0 0 8px' }}>{this.props.section?`${this.props.section} could not load`:'Something went wrong'}</h2>
            <p className="subtle" style={{ margin: '0 0 16px', fontSize: 14, overflowWrap:'anywhere',wordBreak:'break-word' }}>
              {this.state.error?.message || 'An unexpected error occurred while rendering the workspace.'}
            </p>
            <button
              type="button"
              className="btn btn-hot w-full"
              onClick={() => {
                this.setState({ hasError: false, error: null,componentStack:'',copied:false });
                if(!this.props.section) window.location.reload();
              }}
            >
              {this.props.section?'Retry this view':'Reload Health OS'}
            </button>
            <button className="btn btn-soft" onClick={this.openToday}>Open Today</button>
            {!this.props.section&&<button className="btn btn-soft" onClick={()=>void signOutCloud().then(()=>this.setState({hasError:false,error:null,componentStack:'',copied:false}))}>Sign out</button>}
            <button className="btn btn-soft" onClick={()=>void navigator.clipboard?.writeText(this.diagnostics()).then(()=>this.setState({copied:true})).catch(()=>this.setState({copied:false}))}>{this.state.copied?'Error details copied':'Copy error details'}</button>
            <details><summary>Error details · Health OS {APP_VERSION}</summary><pre style={{textAlign:'left',whiteSpace:'pre-wrap',overflowWrap:'anywhere',fontSize:11}}>{this.diagnostics()}</pre></details>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
