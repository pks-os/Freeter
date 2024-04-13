/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { ContextMenuEvent, ReactComponent, WidgetReactComponentProps } from '@/widgets/appModules';
import { Settings } from './settings';
import styles from './widget.module.scss';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
// import { DidFailLoadEvent } from 'electron';
import { createActionBarItems } from '@/widgets/webpage/actionBar';
import { sanitizeUrl } from '@common/helpers/sanitizeUrl';
import { createContextMenuFactory } from '@/widgets/webpage/contextMenu';
import { ContextMenuEvent as ElectronContextMenuEvent } from 'electron';
import { createPartition } from '@/widgets/webpage/partition';
import { createUserAgent } from '@/widgets/webpage/userAgent';
import { reload } from '@/widgets/webpage/actions';

interface WebviewProps extends WidgetReactComponentProps<Settings> {
  /**
   * Should be called when <Webview> tag requires a full restart by
   * replacing it in DOM
   */
  onRequireRestart: () => void;
}

function Webview({settings, widgetApi, onRequireRestart, env, id}: WebviewProps) {
  const {url, sessionScope, sessionPersist, viewMode, autoReload} = settings;

  const partition = useMemo(() => createPartition(sessionPersist, sessionScope, env, id), [
    env, id, sessionScope, sessionPersist
  ])

  const initPartition = useRef(partition)

  const userAgent = useMemo(() => createUserAgent(viewMode, widgetApi.process), [
    viewMode, widgetApi.process
  ]);

  const initViewMode = useRef(viewMode)

  useEffect(() => {
    if(partition !== initPartition.current || viewMode !== initViewMode.current) {
      onRequireRestart();
    }
  }, [onRequireRestart, partition, viewMode])

  const {updateActionBar, setContextMenuFactory} = widgetApi;
  const webviewRef = useRef<Electron.WebviewTag>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [webviewIsReady, setWebviewIsReady] = useState(false);
  const [autoReloadStopped, setAutoReloadStopped] = useState(false);

  const sanitUrl = useMemo(() => sanitizeUrl(url), [url]);

  const refreshActions = useCallback(
    () => updateActionBar(
      createActionBarItems(
        webviewIsReady ? webviewRef.current : null,
        widgetApi,
        url,
        autoReload,
        autoReloadStopped,
        setAutoReloadStopped
      )
    ),
    [autoReload, autoReloadStopped, updateActionBar, url, webviewIsReady, widgetApi]
  );

  useEffect(() => {
    setContextMenuFactory(
      createContextMenuFactory(
        webviewIsReady ? webviewRef.current : null,
        widgetApi,
        url,
        autoReload,
        autoReloadStopped,
        setAutoReloadStopped
      )
    )

    return undefined;
  }, [setContextMenuFactory, webviewIsReady, widgetApi, url, autoReload, autoReloadStopped])

  useEffect(() => {
    const webviewEl = webviewRef.current;

    if (!webviewEl) {
      return undefined;
    }

    const handleDidAttach = () => {
      setWebviewIsReady(true);
    }
    const handleDidStartLoading = () => {
      setIsLoading(true);
    }
    const handleDidStopLoading = () => {
      setIsLoading(false);
    }

    // Electron creates a 'context-menu' event for Webview element. We should turn it
    // into a HTML-standard 'contextmenu' event to enable context menus. We also
    // transfer ElectronContextMenuEvent.params as contextData to make it accessible
    // in contextMenuFactory.
    const handleContextMenu = (e: ElectronContextMenuEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const evt = new MouseEvent('contextmenu', {bubbles: true}) as ContextMenuEvent;
      evt.contextData = e.params;
      webviewEl.dispatchEvent(evt);
    }
    // const handleDidFailLoad = (e: DidFailLoadEvent) => {
    //   console.log(e.errorDescription);
    // };

    // Add event listeners
    webviewEl.addEventListener('did-attach', handleDidAttach);
    webviewEl.addEventListener('did-start-loading', handleDidStartLoading);
    webviewEl.addEventListener('did-stop-loading', handleDidStopLoading);
    // webviewEl.addEventListener('did-fail-load', handleDidFailLoad);
    webviewEl.addEventListener('context-menu', handleContextMenu)

    return () => {
      // Remove event listeners
      webviewEl.removeEventListener('did-attach', handleDidAttach);
      webviewEl.removeEventListener('did-start-loading', handleDidStartLoading);
      webviewEl.removeEventListener('did-stop-loading', handleDidStopLoading);
      // webviewEl.removeEventListener('did-fail-load', handleDidFailLoad);
      webviewEl.removeEventListener('context-menu', handleContextMenu)
    };
  }, []);

  useEffect(() => {
    refreshActions();

    const webviewEl = webviewRef.current;

    if (!webviewEl) {
      return undefined;
    }

    const handleDomReady = () => {
      refreshActions();
      // webviewEl.classList.add('is-bg-visible');
    }
    const handleDidFinishLoad = () => {
      refreshActions();
    }
    const handleDidNavigate = () => {
      refreshActions();
    }
    // const handleDidNavigateInPage = () => {
    //   refreshActions();
    // }

    // Add event listeners
    webviewEl.addEventListener('dom-ready', handleDomReady);
    webviewEl.addEventListener('did-navigate', handleDidNavigate);
    // webviewEl.addEventListener('did-navigate-in-page', handleDidNavigateInPage);
    webviewEl.addEventListener('did-finish-load', handleDidFinishLoad);

    return () => {
      // Remove event listeners
      webviewEl.removeEventListener('dom-ready', handleDomReady);
      webviewEl.removeEventListener('did-navigate', handleDidNavigate);
      // webviewEl.removeEventListener('did-navigate-in-page', handleDidNavigateInPage);
      webviewEl.removeEventListener('did-finish-load', handleDidFinishLoad);
          };
  }, [refreshActions]);

  useEffect(() => {
    if (autoReload>0 && !autoReloadStopped) {
      const interval = setInterval(() => webviewRef.current && reload(webviewRef.current), autoReload*1000)

      return () => clearInterval(interval)
    }
    return undefined;
  }, [autoReload, autoReloadStopped])

  return <>
    <webview
      ref={webviewRef}
      // eslint-disable-next-line react/no-unknown-property
      allowpopups={'' as unknown as boolean}
      // eslint-disable-next-line react/no-unknown-property
      partition={initPartition.current}
      // eslint-disable-next-line react/no-unknown-property
      useragent={userAgent}
      className={styles['webview']}
      tabIndex={0} // this enables the tab-navigation to widget action bar
      src={sanitUrl}
    ></webview>
    {isLoading && <div className={styles['loading']}>Loading...</div>}
  </>
}

export function WidgetComp(props: WidgetReactComponentProps<Settings>) {
  const {url} = props.settings;
  const [requireRestart, setRequireRestart] = useState(1);

  const doRestart = useCallback(() => setRequireRestart(requireRestart+1), [requireRestart])

  useEffect(()=> {
    if(!url) {
      const {updateActionBar, setContextMenuFactory} = props.widgetApi;
      setContextMenuFactory(createContextMenuFactory(null, props.widgetApi, url, 0, false, () => undefined));
      updateActionBar(createActionBarItems(null, props.widgetApi, url, 0, false, () => undefined));
    }
  }, [props.widgetApi, url]);

  return url ? (
    <Webview key={requireRestart} onRequireRestart={doRestart} {...props}></Webview>
  ) : (
    <div className={styles['not-configured']}>
      Webpage URL not specified.
    </div>
  )
}

export const widgetComp: ReactComponent<WidgetReactComponentProps<Settings>> = {
  type: 'react',
  Comp: WidgetComp
}
