// matchmaking_supabase.js - Fixed version with better error handling

// Make sure to replace these with your actual Supabase URL and Anon Key
const SUPABASE_URL = "https://lunxhfsvlfyhqehpirdi.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx1bnhoZnN2bGZ5aHFlaHBpcmRpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDgzMDMzMzMsImV4cCI6MjA2Mzg3OTMzM30.iKEnrtSVjwTQhB8OLahTANJzvCamR60bjhC6qvTtwxU";

let supabase = null;
const MATCHMAKING_TABLE = 'matchmaking_queue';
let matchmakingChannel = null;
let localPlayerPeerId = null;
let lookingForMatch = false;
let matchCheckInterval = null;

// Initialize Supabase client with error handling
function initSupabase() {
    if (!supabase) {
        try {
            if (typeof self !== 'undefined' && self.supabase && self.supabase.createClient) {
                supabase = self.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
                console.log('[Matchmaking] Supabase client initialized successfully');
            } else {
                console.error('[Matchmaking] Supabase library not found. Make sure it is loaded before this script.');
                return false;
            }
        } catch (error) {
            console.error('[Matchmaking] Error initializing Supabase client:', error);
            return false;
        }
    }
    return true;
}

async function cleanupMyStaleEntries() {
    if (!localPlayerPeerId || !supabase) return;
    
    console.log('[Matchmaking] Cleaning up any stale entries for peerId:', localPlayerPeerId);
    try {
        const { error } = await supabase
            .from(MATCHMAKING_TABLE)
            .delete()
            .eq('peer_id', localPlayerPeerId);

        if (error) {
            console.error('[Matchmaking] Error cleaning up stale entries:', error);
        } else {
            console.log('[Matchmaking] Successfully cleaned up stale entries');
        }
    } catch (error) {
        console.error('[Matchmaking] Exception during cleanup:', error);
    }
}

async function findMatch() {
    if (!lookingForMatch || !localPlayerPeerId || !supabase) return null;

    console.log('[Matchmaking] Checking for available opponents...');
    try {
        // Fetch other waiting players, oldest first, not ourselves
        const { data: availablePlayers, error } = await supabase
            .from(MATCHMAKING_TABLE)
            .select('peer_id, created_at')
            .eq('status', 'waiting')
            .not('peer_id', 'eq', localPlayerPeerId)
            .order('created_at', { ascending: true })
            .limit(10); // Look at a few recent ones

        if (error) {
            console.error('[Matchmaking] Error fetching available players:', error);
            return null;
        }

        if (availablePlayers && availablePlayers.length > 0) {
            // Try to "claim" the first available player
            const opponent = availablePlayers[0];
            console.log('[Matchmaking] Found potential opponent:', opponent.peer_id);

            // Update our status to 'matching' to signal we're trying to pair
            const { error: updateSelfError } = await supabase
                .from(MATCHMAKING_TABLE)
                .update({ status: 'matching', opponent_peer_id: opponent.peer_id })
                .eq('peer_id', localPlayerPeerId)
                .eq('status', 'waiting'); // Important: only update if we are still waiting

            if (updateSelfError) {
                console.warn('[Matchmaking] Could not update self status to matching:', updateSelfError);
                return null;
            }

            // Verify our status was actually updated
            const { data: selfCheck, error: selfCheckError } = await supabase
                .from(MATCHMAKING_TABLE)
                .select('status, opponent_peer_id')
                .eq('peer_id', localPlayerPeerId)
                .single();

            if (selfCheckError || !selfCheck || selfCheck.status !== 'matching') {
                console.warn('[Matchmaking] Self status update failed or someone else matched with us. Aborting this attempt.');
                // Reset our status if it wasn't 'matching' to avoid being stuck
                await supabase.from(MATCHMAKING_TABLE).update({ status: 'waiting', opponent_peer_id: null }).eq('peer_id', localPlayerPeerId);
                return null;
            }

            // Try to update opponent's status to 'matching'
            const { data: updatedOpponentData, error: updateOpponentError } = await supabase
                .from(MATCHMAKING_TABLE)
                .update({ status: 'matching', opponent_peer_id: localPlayerPeerId })
                .eq('peer_id', opponent.peer_id)
                .eq('status', 'waiting') // Important: only update if they are still waiting
                .select()
                .single();

            if (updateOpponentError || !updatedOpponentData || updatedOpponentData.status !== 'matching') {
                console.warn('[Matchmaking] Could not update opponent status to matching. They might have been matched by someone else. Reverting self.');
                // Revert our status back to 'waiting'
                await supabase
                    .from(MATCHMAKING_TABLE)
                    .update({ status: 'waiting', opponent_peer_id: null })
                    .eq('peer_id', localPlayerPeerId);
                return null;
            }

            // If both updates were successful, we have a match!
            console.log('[Matchmaking] Successfully locked match with:', opponent.peer_id);
            lookingForMatch = false;
            if (matchCheckInterval) {
                clearInterval(matchCheckInterval);
                matchCheckInterval = null;
            }

            // Return the opponent's peer_id
            return opponent.peer_id;
        }
    } catch (error) {
        console.error('[Matchmaking] Exception during findMatch:', error);
    }
    return null;
}

export async function joinQueue(myPeerId, callbacks) {
    if (!initSupabase()) {
        callbacks.onError?.('Failed to initialize Supabase client.');
        return;
    }

    if (lookingForMatch) {
        console.warn('[Matchmaking] Already looking for a match.');
        callbacks.onError?.('Already looking for a match.');
        return;
    }

    if (!myPeerId || typeof myPeerId !== 'string') {
        console.error('[Matchmaking] Invalid peer ID provided:', myPeerId);
        callbacks.onError?.('Invalid peer ID provided.');
        return;
    }

    localPlayerPeerId = myPeerId;
    lookingForMatch = true;
    callbacks.onSearching?.();

    try {
        // Clean up any previous entries for this peer_id
        await cleanupMyStaleEntries();

        // Add self to the queue
        const { error: insertError } = await supabase
            .from(MATCHMAKING_TABLE)
            .insert({ peer_id: localPlayerPeerId, status: 'waiting' });

        if (insertError) {
            console.error('[Matchmaking] Error joining queue:', insertError);
            callbacks.onError?.('Failed to join matchmaking queue: ' + insertError.message);
            lookingForMatch = false;
            localPlayerPeerId = null;
            return;
        }
        
        console.log('[Matchmaking] Successfully joined queue with peerId:', localPlayerPeerId);

        // Start polling for matches
        if (matchCheckInterval) clearInterval(matchCheckInterval);
        matchCheckInterval = setInterval(async () => {
            if (!lookingForMatch) {
                clearInterval(matchCheckInterval);
                matchCheckInterval = null;
                return;
            }
            try {
                const opponentPeerId = await findMatch();
                if (opponentPeerId) {
                    callbacks.onMatchFound?.(opponentPeerId);
                    // The game.js logic will call leaveQueue after attempting connection or on timeout
                }
            } catch (error) {
                console.error('[Matchmaking] Error during match polling:', error);
            }
        }, 3000); // Check for a match every 3 seconds

        // Set a timeout for matchmaking
        setTimeout(async () => {
            if (lookingForMatch) {
                console.log('[Matchmaking] Matchmaking timed out.');
                callbacks.onTimeout?.();
                await leaveQueue(); // Automatically leave queue on timeout
            }
        }, 30000); // 30 seconds timeout

    } catch (error) {
        console.error('[Matchmaking] Exception during joinQueue:', error);
        callbacks.onError?.('Failed to join queue due to an error: ' + error.message);
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
                console.log('[Matchmaking] Successfully removed from queue:', localPlayerPeerId);
            }
        } catch (error) {
            console.error('[Matchmaking] Exception during leaveQueue:', error);
        }
        localPlayerPeerId = null;
    }

    if (matchmakingChannel && supabase) {
        try {
            supabase.removeChannel(matchmakingChannel);
            matchmakingChannel = null;
            console.log('[Matchmaking] Realtime channel removed.');
        } catch (error) {
            console.error('[Matchmaking] Error removing channel:', error);
        }
    }
}

// Optional: Implement Realtime listener for a more responsive experience
export function listenForMatchesRealtime(myPeerId, callbacks) {
    if (!initSupabase()) {
        callbacks.onError?.('Failed to initialize Supabase for realtime.');
        return;
    }

    if (matchmakingChannel) {
        supabase.removeChannel(matchmakingChannel);
    }
    localPlayerPeerId = myPeerId;

    console.log('[Matchmaking RT] Subscribing to matchmaking updates for table:', MATCHMAKING_TABLE);
    try {
        matchmakingChannel = supabase.channel('matchmaking')
            .on('postgres_changes',
                { event: 'INSERT', schema: 'public', table: MATCHMAKING_TABLE },
                async (payload) => {
                    console.log('[Matchmaking RT] New entry in queue:', payload.new);
                    if (lookingForMatch && payload.new.peer_id !== localPlayerPeerId && payload.new.status === 'waiting') {
                        // A new player joined, try to match
                        try {
                            const opponentPeerId = await findMatch();
                            if (opponentPeerId) {
                                callbacks.onMatchFound?.(opponentPeerId);
                            }
                        } catch (error) {
                            console.error('[Matchmaking RT] Error during realtime match attempt:', error);
                        }
                    }
                }
            )
            .on('postgres_changes',
                { event: 'UPDATE', schema: 'public', table: MATCHMAKING_TABLE },
                async (payload) => {
                    if (lookingForMatch && payload.new.status === 'matching' && payload.new.opponent_peer_id === localPlayerPeerId) {
                        console.log('[Matchmaking RT] We have been matched by:', payload.new.peer_id);

                        try {
                            // Verify and finalize the match from our end.
                            const { data: selfEntry, error: selfError } = await supabase
                                .from(MATCHMAKING_TABLE)
                                .update({ status: 'matched', opponent_peer_id: payload.new.peer_id })
                                .eq('peer_id', localPlayerPeerId)
                                .eq('status', 'waiting')
                                .select()
                                .single();

                            if (selfError || !selfEntry || selfEntry.status !== 'matched') {
                                console.warn('[Matchmaking RT] Failed to confirm match or we already matched elsewhere.');
                                return;
                            }

                            lookingForMatch = false;
                            if (matchCheckInterval) {
                                clearInterval(matchCheckInterval);
                                matchCheckInterval = null;
                            }

                            callbacks.onMatchFound?.(payload.new.peer_id);
                        } catch (error) {
                            console.error('[Matchmaking RT] Exception during realtime match confirmation:', error);
                        }
                    }
                }
            )
            .subscribe((status, err) => {
                if (status === 'SUBSCRIBED') {
                    console.log('[Matchmaking RT] Successfully subscribed to realtime matchmaking updates!');
                } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
                    console.error('[Matchmaking RT] Realtime subscription error or timed out:', err || status);
                    callbacks.onError?.('Realtime matchmaking connection error. Using polling.');
                }
            });
    } catch (error) {
        console.error('[Matchmaking RT] Exception setting up realtime listener:', error);
        callbacks.onError?.('Failed to set up realtime matchmaking.');
    }
}