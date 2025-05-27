// matchmaking_supabase.js - Robust and simple matchmaking system

const SUPABASE_URL = "https://lunxhfsvlfyhqehpirdi.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx1bnhoZnN2bGZ5aHFlaHBpcmRpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDgzMDMzMzMsImV4cCI6MjA2Mzg3OTMzM30.iKEnrtSVjwTQhB8OLahTANJzvCamR60bjhC6qvTtwxU";

let supabase = null;
const MATCHMAKING_TABLE = 'matchmaking_queue';
let localPlayerPeerId = null;
let lookingForMatch = false;
let matchCheckInterval = null;

// Initialize Supabase client
function initSupabase() {
    if (!supabase) {
        try {
            if (typeof self !== 'undefined' && self.supabase && self.supabase.createClient) {
                supabase = self.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
                console.log('[Matchmaking] Supabase client initialized successfully');
                return true;
            } else {
                console.error('[Matchmaking] Supabase library not found');
                return false;
            }
        } catch (error) {
            console.error('[Matchmaking] Error initializing Supabase client:', error);
            return false;
        }
    }
    return true;
}

// Clean up any old entries for this peer
async function cleanupMyStaleEntries() {
    if (!localPlayerPeerId || !supabase) return;
    
    try {
        const { error } = await supabase
            .from(MATCHMAKING_TABLE)
            .delete()
            .eq('peer_id', localPlayerPeerId);

        if (error) {
            console.error('[Matchmaking] Error cleaning up stale entries:', error);
        } else {
            console.log('[Matchmaking] Cleaned up stale entries for:', localPlayerPeerId);
        }
    } catch (error) {
        console.error('[Matchmaking] Exception during cleanup:', error);
    }
}

// Simple matchmaking logic - just find the oldest waiting player
async function findMatch() {
    if (!lookingForMatch || !localPlayerPeerId || !supabase) {
        return null;
    }

    try {
        console.log('[Matchmaking] Looking for opponents...');
        
        // Get all waiting players except myself, ordered by creation time
        const { data: waitingPlayers, error } = await supabase
            .from(MATCHMAKING_TABLE)
            .select('peer_id, created_at')
            .eq('status', 'waiting')
            .neq('peer_id', localPlayerPeerId)
            .order('created_at', { ascending: true })
            .limit(1);

        if (error) {
            console.error('[Matchmaking] Error fetching waiting players:', error);
            return null;
        }

        if (!waitingPlayers || waitingPlayers.length === 0) {
            console.log('[Matchmaking] No opponents found, continuing to wait...');
            return null;
        }

        const opponent = waitingPlayers[0];
        console.log('[Matchmaking] Found opponent:', opponent.peer_id);

        // Simple atomic operation: delete the opponent from queue
        // If this succeeds, we "claimed" them
        const { error: deleteError } = await supabase
            .from(MATCHMAKING_TABLE)
            .delete()
            .eq('peer_id', opponent.peer_id)
            .eq('status', 'waiting');

        if (deleteError) {
            console.warn('[Matchmaking] Could not claim opponent (they may have been taken):', deleteError);
            return null;
        }

        // Also remove ourselves from the queue
        await supabase
            .from(MATCHMAKING_TABLE)
            .delete()
            .eq('peer_id', localPlayerPeerId);

        console.log('[Matchmaking] Successfully matched with:', opponent.peer_id);
        
        // Stop looking for matches
        lookingForMatch = false;
        if (matchCheckInterval) {
            clearInterval(matchCheckInterval);
            matchCheckInterval = null;
        }

        return opponent.peer_id;

    } catch (error) {
        console.error('[Matchmaking] Exception during findMatch:', error);
        return null;
    }
}

export async function joinQueue(myPeerId, callbacks) {
    console.log('[Matchmaking] Attempting to join queue with peer ID:', myPeerId);

    if (!initSupabase()) {
        callbacks.onError?.('Failed to initialize Supabase client');
        return;
    }

    if (lookingForMatch) {
        console.warn('[Matchmaking] Already looking for a match');
        callbacks.onError?.('Already looking for a match');
        return;
    }

    if (!myPeerId || typeof myPeerId !== 'string') {
        console.error('[Matchmaking] Invalid peer ID');
        callbacks.onError?.('Invalid peer ID provided');
        return;
    }

    localPlayerPeerId = myPeerId;
    lookingForMatch = true;

    try {
        // Clean up any old entries first
        await cleanupMyStaleEntries();

        // Add ourselves to the queue
        const { error: insertError } = await supabase
            .from(MATCHMAKING_TABLE)
            .insert({ 
                peer_id: localPlayerPeerId, 
                status: 'waiting'
            });

        if (insertError) {
            console.error('[Matchmaking] Error joining queue:', insertError);
            callbacks.onError?.('Failed to join queue: ' + insertError.message);
            lookingForMatch = false;
            localPlayerPeerId = null;
            return;
        }

        console.log('[Matchmaking] Successfully joined queue');
        callbacks.onSearching?.();

        // Start checking for matches every 2 seconds
        matchCheckInterval = setInterval(async () => {
            if (!lookingForMatch) {
                clearInterval(matchCheckInterval);
                matchCheckInterval = null;
                return;
            }

            try {
                const opponentPeerId = await findMatch();
                if (opponentPeerId) {
                    console.log('[Matchmaking] Match found! Connecting to:', opponentPeerId);
                    callbacks.onMatchFound?.(opponentPeerId);
                }
            } catch (error) {
                console.error('[Matchmaking] Error during match search:', error);
            }
        }, 2000);

        // Set timeout for matchmaking (30 seconds)
        setTimeout(async () => {
            if (lookingForMatch) {
                console.log('[Matchmaking] Timeout reached');
                callbacks.onTimeout?.();
                await leaveQueue();
            }
        }, 30000);

    } catch (error) {
        console.error('[Matchmaking] Exception during joinQueue:', error);
        callbacks.onError?.('Error joining queue: ' + error.message);
        lookingForMatch = false;
        localPlayerPeerId = null;
    }
}

export async function leaveQueue() {
    console.log('[Matchmaking] Leaving queue...');
    
    lookingForMatch = false;
    
    if (matchCheckInterval) {
        clearInterval(matchCheckInterval);
        matchCheckInterval = null;
    }

    if (localPlayerPeerId && supabase) {
        try {
            const { error } = await supabase
                .from(MATCHMAKING_TABLE)
                .delete()
                .eq('peer_id', localPlayerPeerId);

            if (error) {
                console.error('[Matchmaking] Error leaving queue:', error);
            } else {
                console.log('[Matchmaking] Successfully left queue');
            }
        } catch (error) {
            console.error('[Matchmaking] Exception while leaving queue:', error);
        }
        
        localPlayerPeerId = null;
    }
}