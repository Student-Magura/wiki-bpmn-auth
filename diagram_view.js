<!DOCTYPE html>
<html>
<head>
    <title>Main Page</title>
</head>
<body>

    <h4 id="status">Loading diagram...</h4>

    <div id="viewer"  style="width: 100%; height: 600px;"></div>

    <script src="https://www.draw.io/js/viewer.min.js"></script>
    <script src="https://accounts.google.com/gsi/client" async defer></script>
    <!-- <div id="g_id_onload"
        data-client_id="857911678835-55s20dikocs0s1f57eb4veb9r1m75uvr.apps.googleusercontent.com"
        data-context="signin"
        data-scope="https://www.googleapis.com/auth/cloud-platform"
        data-ux_mode="popup"
        data-callback="handleCredentialResponse">
    </div> -->

    <div class="signIn" data-type="standard"></div>

    <script type="module">

const SERVICE_ACC_TOKEN = 'service'
const USER_TOKEN = 'user'
const REFRESH_TOKEN = 'refresh'

const CLIENT_ID = '857911678835-55s20dikocs0s1f57eb4veb9r1m75uvr.apps.googleusercontent.com';
const REDIRECT_URI = 'https://Student-Magura.github.io/wiki-bpmn-auth/auth-callback.html';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const SERVICE_URL = 'https://servacc-jwt-issuer-857911678835.europe-north1.run.app';

async function authUser() {
    return new Promise((resolve, reject) => {
        // // old iframe
        // const iframe = document.createElement('iframe');
        // iframe.src = 'https://student-magura.github.io/wiki-bpmn-auth/';
        // document.body.appendChild(iframe);

        const scope = 'https://www.googleapis.com/auth/cloud-platform openid email';
        const urlParams = new URLSearchParams({ scope });
        const oauthHostUrl = 'https://Student-Magura.github.io/wiki-bpmn-auth/auth-iframe-host.html?' + urlParams.toString();
        const authPopup = window.open(oauthHostUrl, 'GoogleOAuth', 'width=500,height=600');

        // wait for the token
        const messageHandler = async (event) => {
            if (event.origin !== 'https://student-magura.github.io') {
                reject(new Error('Invalid origin'));
            }
            if (!event.data.authCode) {
                reject(new Error('No authCode'));
            }
            const authData = event.data;
            console.log('authData: ', authData);
            // const userToken = event.data.userToken;
            // console.log('userToken: ', userToken);
            window.removeEventListener('message', messageHandler);
            // iframe.remove();
            authPopup.close();

            // resolve(userToken);
            const tokenData = await exchangeCodeForToken(authData.authCode);
            console.log('ID Token:', tokenData.id_token);
            resolve(tokenData);
        };

        window.addEventListener('message', messageHandler);

        // Timeout to reject the promise if no message is received
        setTimeout(() => {
            window.removeEventListener('message', messageHandler);
            // iframe.remove();
            authPopup.close();
            reject(new Error('Timeout waiting for userToken'));
        }, 60000); // 10 seconds timeout
    });
}

function tokenValidFor(jwt) {
    const token = jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(token));
    const exp = payload.exp;
    const now = Math.floor(Date.now() / 1000);
    if (now > exp)
        return 0;
    return exp - now;
}

async function fetchServiceAccJWT(userToken) {
    const response = await fetch(SERVICE_URL + '/issue-jwt', {
        headers: {
            Authorization: `Bearer ${userToken}`
        }
    });
    const data = await response.json();
    console.log('data: ', data);
    return data.jwt;
}

async function getServiceAccToken() {
    const serviceAccToken = localStorage.getItem(SERVICE_ACC_TOKEN);
    if (!serviceAccToken || tokenValidFor(serviceAccToken) <= 0) {
        console.log(!serviceAccToken ? 'serviceAccToken not found' : 'serviceAccToken expired');
        const userToken = await getUserToken();
        const newServiceAccToken = await fetchServiceAccJWT(userToken);
        if (!newServiceAccToken) {
            throw new Error('No service account token');
        }
        localStorage.setItem(SERVICE_ACC_TOKEN, newServiceAccToken);
        return newServiceAccToken;
    }
    console.log('serviceAccToken found');
    return serviceAccToken;
}

async function getUserToken() {
    const userToken = localStorage.getItem(USER_TOKEN);
    if (!userToken || tokenValidFor(userToken) <= 0) {
        console.log(!userToken ? 'userToken not found' : 'userToken expired');
        const newUserToken = await refreshUserSession();
        localStorage.setItem(USER_TOKEN, newUserToken);
        return newUserToken;
    }
    console.log('userToken found');
    return userToken;
}

let resolveUserTokenPromise;
let rejectUserTokenPromise;
async function refreshUserSession() {
    // refresh user session by re-authenticating
    return new Promise((resolve, reject) => {
        resolveUserTokenPromise = resolve;
        rejectUserTokenPromise = reject;
        google.accounts.id.renderButton(
            document.querySelector('.signIn'),
            { theme: 'outline', size: 'large' }  // customization attributes
        );
        google.accounts.id.prompt();

        // Timeout to reject the promise if no message is received
        setTimeout(() => {
            reject(new Error('Timeout waiting for userToken'));
        }, 60000); // 60 seconds timeout
    });
    // google.accounts.id.prompt(); // also display the One Tap dialog
}

function handleCredentialResponse(response) {
    console.log('handleCredentialResponse:', response);
    if (response.credential) {
        console.log('User is signed in');
        resolveUserTokenPromise(response.credential);
    } else {
        console.log('User is not signed in');
        rejectUserTokenPromise(new Error('User is not signed in'));
    }
}

async function makeTokenRequest(params) {
    try {
        const response = await fetch(TOKEN_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: params.toString(),
        });
        return await response.json();
    } catch (error) {
        console.error('Request failed:', error);
        throw error;
    }
}

async function getAccessToken() {
    const serviceAccToken = await getServiceAccToken();
    const response = await makeTokenRequest(new URLSearchParams({
        'grant_type': 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        'assertion': serviceAccToken,
    }));
    if (response.access_token) {
        console.log('Access Token:', response.access_token);
        return response.access_token;
    } else {
        console.error('Error:', response);
        throw new Error(`No access token: ${response.error}`);
    }
}

async function loadDiagram(accessToken) {
    const filePath = 'bpmn/Architecture Light Test.drawio'
    const bucket = 'bpmn-wiki';
    const url = getUrl(bucket, filePath);


    const fileContent = await getFile(url, accessToken);
    console.log(`Loaded content (Loading diagram...${fileContent.length} bytes): ${fileContent.substring(0, 100)}...`);

    document.getElementById('status').innerText = 'Diagram loaded';

    const container = document.getElementById('viewer');
    console.log(container);
    EditorUi.prototype.updateActionStates = function() {};
    EditorUi.prototype.addBeforeUnloadListener = function() {};
    EditorUi.prototype.addChromelessClickHandler = function() {};

    urlParams['toolbar-config'] = encodeURIComponent(JSON.stringify({
        noCloseBtn: true,
    }));

    const ui = new EditorUi(new Editor(true), document.createElement('div'), true);
    const graph = ui.editor.graph;
    const lightbox = graph.container;
    container.appendChild(lightbox);

    setTimeout(() => {
        ui.setFileData(fileContent);
        lightbox.style.height = container.offsetHeight + 'px';
        ui.lightboxFit(container.offsetHeight);
    });
}

// const accessToken = await getAccessToken();
// loadDiagram(accessToken);

async function getMetadata(url, accessToken) {
    const response = await fetch(url, {
        headers: {
            'Authorization': `Bearer ${accessToken}`
        }
    });
    const data = await response.json();
    return data;
}

async function getFile(url, accessToken) {
    console.log('getFile:', url, accessToken);
    const metadata = await getMetadata(url, accessToken);
    console.log('metadata:', metadata);
    const response = await fetch(metadata.mediaLink, {
        headers: {
            'Authorization': `Bearer ${accessToken}`
        }
    });
    const data = await response.text();
    return data;
}

function getUrl(bucket, filePath) {
    return `https://storage.googleapis.com/storage/v1/b/${bucket}/o/${encodeURIComponent(filePath)}`;
}

window.onload = async function () {
    google.accounts.id.initialize({
        client_id: CLIENT_ID,
        callback: handleCredentialResponse
    });

    const accessToken = await getAccessToken();
    loadDiagram(accessToken);

    // const userToken = localStorage.getItem(USER_TOKEN);
    // if (isUndefined(userToken) || tokenValidFor(userToken) <= 0) {
    //     google.accounts.id.renderButton(
    //         document.querySelector('signIn'),
    //         { theme: 'outline', size: 'large' }  // customization attributes
    //     );
    //     google.accounts.id.prompt(); // also display the One Tap dialog
    // } else {
    //     console.log('User is already signed in');
    //     // Proceed with your application logic
        
    // }
};

</script>
