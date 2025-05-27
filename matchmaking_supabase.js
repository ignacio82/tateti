// matchmaking_supabase.js - Ultra simple test version

const SUPABASE_URL = "https://lunxhfsvlfyhqehpirdi.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx1bnhoZnN2bGZ5aHFlaHBpcmRpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDgzMDMzMzMsImV4cCI6MjA2Mzg3OTMzM30.iKEnrtSVjwTQhB8OLahTANJzvCamR60bjhC6qvTtwxU";

let supabase = null;
let localPlayerPeerId = null;
let lookingForMatch = false;
let matchCheckInterval = null;

// Initialize Supabase
function initSupabase() {
    if (!supabase && self.supabase) {
        supabase = self.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        console.log('[Matchmaking] ✅ Supabase initialized');
        return true;
    }
    return !!supabase;
}

export async function joinQueue(myPeerId, callbacks) {
    console.log(`[Matchmaking] 🚀 Starting matchmaking for: ${myPeerId}`);
    
    if (!initSupabase()) {
        console.error('[Matchmaking] ❌ Supabase init failed');
        callbacks.onError?.('Supabase initialization failed');
        return;
    }

    localPlayerPeerId = myPeerId;
    lookingForMatch = true;
    callbacks.onSearching?.();

    try {
        // Step 1: Clean up old entries
        console.log('[Matchmaking] 🧹 Cleaning up old entries...');
        await supabase.from('matchmaking_queue').delete().eq('peer_id', myPeerId);

        // Step 2: Add ourselves to queue
        console.log('[Matchmaking] ➕ Adding to queue...');
        const { error: insertError } = await supabase
            .from('matchmaking_queue')
            .insert({ peer_id: myPeerId, status: 'waiting' });

        if (insertError) {
            console.error('[Matchmaking] ❌ Insert failed:', insertError);
            callbacks.onError?.('Failed to join queue');
            return;
        }

        console.log('[Matchmaking] ✅ Successfully joined queue!');

        // Step 3: Start looking for opponents
        let attempts = 0;
        matchCheckInterval = setInterval(async () => {
            attempts++;
            console.log(`[Matchmaking] 🔍 Search attempt ${attempts}...`);

            if (!lookingForMatch) return;

            try {
                // Get ALL waiting players except me
                const { data: waitingPlayers, error } = await supabase
                    .from('matchmaking_queue')
                    .select('peer_id')
                    .eq('status', 'waiting')
                    .neq('peer_id', myPeerId);

                if (error) {
                    console.error('[Matchmaking] ❌ Query error:', error);
                    return;
                }

                console.log(`[Matchmaking] 👥 Found ${waitingPlayers?.length || 0} waiting players:`, waitingPlayers);

                if (waitingPlayers && waitingPlayers.length > 0) {
                    const opponent = waitingPlayers[0];
                    console.log(`[Matchmaking] 🎯 Trying to match with: ${opponent.peer_id}`);

                    // Try to remove opponent from queue (claim them)
                    const { error: deleteError } = await supabase
                        .from('matchmaking_queue')
                        .delete()
                        .eq('peer_id', opponent.peer_id)
                        .eq('status', 'waiting');

                    if (!deleteError) {
                        console.log(`[Matchmaking] 🎉 SUCCESS! Matched with: ${opponent.peer_id}`);
                        
                        // Remove ourselves too
                        await supabase.from('matchmaking_queue').delete().eq('peer_id', myPeerId);
                        
                        lookingForMatch = false;
                        clearInterval(matchCheckInterval);
                        callbacks.onMatchFound?.(opponent.peer_id);
                        return;
                    } else {
                        console.log('[Matchmaking] ⚡ Opponent was taken, trying again...');
                    }
                }
            } catch (error) {
                console.error('[Matchmaking] ❌ Search error:', error);
            }
        }, 3000); // Check every 3 seconds

        // Timeout after 30 seconds
        setTimeout(() => {
            if (lookingForMatch) {
                console.log('[Matchmaking] ⏰ Timeout reached');
                callbacks.onTimeout?.();
                leaveQueue();
            }
        }, 30000);

    } catch (error) {
        console.error('[Matchmaking] ❌ Join queue error:', error);
        callbacks.onError?.('Error joining queue');
    }
}

export async function leaveQueue() {
    console.log('[Matchmaking] 👋 Leaving queue...');
    
    lookingForMatch = false;
    
    if (matchCheckInterval) {
        clearInterval(matchCheckInterval);
        matchCheckInterval = null;
    }

    if (localPlayerPeerId && supabase) {
        try {
            await supabase.from('matchmaking_queue').delete().eq('peer_id', localPlayerPeerId);
            console.log('[Matchmaking] ✅ Successfully left queue');
        } catch (error) {
            console.error('[Matchmaking] ❌ Error leaving queue:', error);
        }
        localPlayerPeerId = null;
    }
}