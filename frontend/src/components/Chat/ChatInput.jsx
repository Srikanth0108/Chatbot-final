import React, { useState, useContext, useRef, useEffect } from "react";
import { ChatContext } from "../../context/ChatContext";
import { toast } from "react-hot-toast";
import "./Chat.css";

const ChatInput = () => {
  const [message, setMessage] = useState("");
  const { sendMessage, isLoading, stopResponse } = useContext(ChatContext);
  const [isRecording, setIsRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState(null);
  const [audioChunks, setAudioChunks] = useState([]);
  const [pauseTimeout, setPauseTimeout] = useState(null);
  const [processingAudio, setProcessingAudio] = useState(false);
  
  // Reference to the microphone button
  const micButtonRef = useRef(null);
  const textareaRef = useRef(null);

  // Get the selected language from localStorage
  const getSelectedLanguage = () => {
    return localStorage.getItem("preferredLanguage") || "en";
  };

  useEffect(() => {
    // Clean up media recorder when component unmounts
    return () => {
      if (mediaRecorder && mediaRecorder.state !== "inactive") {
        mediaRecorder.stop();
      }
      if (pauseTimeout) {
        clearTimeout(pauseTimeout);
      }
    };
  }, [mediaRecorder, pauseTimeout]);
   
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "46px"; // Reset height
      const scrollHeight = textareaRef.current.scrollHeight;
      textareaRef.current.style.height = `${Math.min(scrollHeight, 120)}px`; // Set new height with max limit
    }
  }, [message]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (message.trim()) {
      sendMessage(message);
      setMessage("");
      if (textareaRef.current) {
        textareaRef.current.style.height = "46px"; // Reset height
    }
  }
  };
   
  const handleKeyDown = (e) => {
    // Send message on Enter (without Shift)
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleStopResponse = () => {
    stopResponse();
  };

  const startRecording = async () => {
    try {
      // Don't start a new recording if we're already processing audio
      if (processingAudio) {
        toast.info("Still processing previous audio. Please wait.");
        return;
      }
      
      // Reset audio chunks state first
      setAudioChunks([]);
      
      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          sampleRate: 16000,
          channelCount: 1,
        } 
      });
      
      // Create new media recorder with empty audioChunks
      const recorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm',
        audioBitsPerSecond: 16000
      });
      
      // Create a fresh array for this recording session
      let currentRecordingChunks = [];
      
      // Set up event listeners
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          // Use the local array instead of the state directly
          currentRecordingChunks.push(e.data);
        }
      };
      
      recorder.onstop = async () => {
        // Stop all audio tracks
        stream.getTracks().forEach(track => track.stop());
        
        // Clear any existing pause timeout
        if (pauseTimeout) {
          clearTimeout(pauseTimeout);
          setPauseTimeout(null);
        }
        
        // Process the audio if there are chunks
        if (currentRecordingChunks.length > 0) {
          setProcessingAudio(true);
          const audioBlob = new Blob(currentRecordingChunks, { type: 'audio/wav' });
          // Only now update the state with the full recording
          setAudioChunks(currentRecordingChunks);
          await processAudio(audioBlob);
          setProcessingAudio(false);
        }
        // Reset recording state
        setIsRecording(false);
      };
      
      // Start recording
      recorder.start();
      setMediaRecorder(recorder);
      setIsRecording(true);
      
      // Set up voice activity detection
      setupVoiceActivityDetection(stream);
      
    } catch (error) {
      console.error("Error accessing microphone:", error);
      toast.error("Could not access microphone. Please check permissions.");
      setIsRecording(false);
    }
  };

  const setupVoiceActivityDetection = (stream) => {
    // Create audio context
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const analyser = audioContext.createAnalyser();
    const microphone = audioContext.createMediaStreamSource(stream);
    
    // Instead of ScriptProcessorNode, we'll use an AudioWorkletNode approach
    // But since it requires a more complex setup with a separate file, we'll use
    // a simpler approach for now with an AnalyserNode
    
    analyser.smoothingTimeConstant = 0.8;
    analyser.fftSize = 1024;
    
    microphone.connect(analyser);
    
    // Variables to track speech activity
    let silenceStart = Date.now();
    let silenceTimeout = 1500; // 1.5 seconds of silence
    let speechDetected = false;
    
    // Create a function to check audio levels
    const checkAudioLevels = () => {
      if (!isRecording) return;
      
      const array = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteFrequencyData(array);
      
      // Calculate average frequency
      const average = array.reduce((acc, val) => acc + val, 0) / array.length;
      
      // Check if there's sound (adjust threshold as needed)
      if (average > 15) {
        // Reset silence timer when sound is detected
        silenceStart = Date.now();
        speechDetected = true;
        
        // Clear any pending timeout
        if (pauseTimeout) {
          clearTimeout(pauseTimeout);
          setPauseTimeout(null);
        }
      } else {
        // Check if silence has lasted longer than the timeout
        const silenceDuration = Date.now() - silenceStart;
        
        if (silenceDuration > silenceTimeout && !pauseTimeout) {
          // Set timeout to stop recording after silence
          const timeout = setTimeout(() => {
            if (mediaRecorder && mediaRecorder.state !== "inactive") {
              mediaRecorder.stop();
            }
          }, 200); // Small delay to ensure we catch the end of speech
          
          setPauseTimeout(timeout);
        }
      }
      
      // Continue checking levels if still recording
      if (isRecording) {
        requestAnimationFrame(checkAudioLevels);
      }
    };
    
    // Start checking audio levels
    requestAnimationFrame(checkAudioLevels);
    
    // Initial timeout to check if speech was detected
    const initialTimeout = setTimeout(() => {
      if (!speechDetected && mediaRecorder && mediaRecorder.state !== "inactive") {
        mediaRecorder.stop();
        toast.info("No speech detected. Please try again.");
      }
    }, 3000);
    
    // Clean up when recording stops
    return () => {
      clearTimeout(initialTimeout);
      analyser.disconnect();
      microphone.disconnect();
      if (audioContext.state !== 'closed') {
        audioContext.close();
      }
    };
  };

  const stopRecording = () => {
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
      mediaRecorder.stop();
    }
  };

  const toggleRecording = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  const processAudio = async (audioBlob) => {
    // Don't use the state directly here, just use the blob that was passed in
    if (audioBlob.size < 500) {
      toast.info("No speech detected. Please try again.");
      return;
    }
    
    const formData = new FormData();
    formData.append('audio', audioBlob, 'recording.webm');
    formData.append('language', getSelectedLanguage());
    
    try {
      // Send the audio to the server for processing
      const loadingToast = toast.loading("Processing your speech...");
      const response = await fetch('/api/speech_to_text', {
        method: 'POST',
        body: formData,
      });
      toast.dismiss(loadingToast);
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Server error");
      }
      
      const data = await response.json();
      
      if (data.text && data.text.trim()) {
        // Set the recognized text as the message
        setMessage(data.text);
        
        // To ensure consistency, we now wait for the message to be updated
        // before sending it automatically
        setTimeout(() => {
          sendMessage(data.text);
          setMessage("");
        }, 100);
      } else {
        toast.error("Couldn't understand audio. Please try again.");
      }
    } catch (error) {
      console.error("Error processing audio:", error);
      toast.error(`Error processing audio, try again.`);
    }
  };

  return (
    <div className="chat-input-container">
      <form onSubmit={handleSubmit} className="chat-form">
      <textarea
          ref={textareaRef}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type your message..."
          disabled={isLoading || processingAudio}
          className="chat-input"
          rows="1"
        />

        <div className="chat-input-buttons">
          <button
            type="button"
            onClick={toggleRecording}
            className={`mic-button ${isRecording ? 'recording' : ''} ${processingAudio ? 'processing' : ''}`}
            ref={micButtonRef}
            title={isRecording ? "Stop recording" : processingAudio ? "Processing..." : "Start recording"}
            disabled={isLoading || processingAudio}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
              <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
              <line x1="12" y1="19" x2="12" y2="23"></line>
              <line x1="8" y1="23" x2="16" y2="23"></line>
            </svg>
          </button>

          {isLoading ? (
            <button
              type="button"
              className="stop-button"
              onClick={handleStopResponse}
              title="Stop generating"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <rect x="6" y="6" width="12" height="12"></rect>
              </svg>
            </button>
          ) : (
            <button
              type="submit"
              disabled={!message.trim() || processingAudio}
              className="send-button"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M22 2L11 13"></path>
                <path d="M22 2L15 22L11 13L2 9L22 2Z"></path>
              </svg>
            </button>
          )}
        </div>
      </form>
    </div>
  );
};

export default ChatInput;