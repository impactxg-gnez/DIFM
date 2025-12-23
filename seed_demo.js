
const BASE_URL = 'http://127.0.0.1:3001';

async function register(email, password, name, role) {
    console.log(`Creating ${role}: ${email}`);
    try {
        const res = await fetch(`${BASE_URL}/api/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password, name, role })
        });

        if (res.ok) {
            console.log(`SUCCESS: Created ${email}`);
        } else if (res.status === 409) {
            console.log(`NOTE: ${email} already exists (Password: ${password})`);
        } else {
            console.error(`FAILED: ${await res.text()}`);
        }
    } catch (e) {
        console.error("Error:", e.message);
    }
}

async function main() {
    await register('customer@demo.com', 'password123', 'Demo Customer', 'CUSTOMER');
    await register('provider@demo.com', 'password123', 'Demo Provider', 'PROVIDER');
    await register('admin@demo.com', 'password123', 'Demo Admin', 'ADMIN');
}

main();
