
import { GoogleGenAI } from "@google/genai";
import { Task, JournalEntry } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const getTaskAnalysis = async (tasks: Task[]): Promise<string> => {
  if (tasks.length === 0) return "Add some tasks to get an AI summary of your day!";
  
  const taskSummary = tasks.map(t => `- ${t.title} (Due: ${t.dueDate}, ${t.completed ? 'Done' : 'Pending'})`).join('\n');
  
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Analyze my current task list and give me a 2-sentence motivational summary and prioritization tip:\n${taskSummary}`,
      config: {
        temperature: 0.7,
        topP: 0.9,
      }
    });
    
    return response.text || "Keep pushing forward!";
  } catch (error) {
    console.error("Gemini Error:", error);
    return "The AI assistant is taking a break. Stay focused!";
  }
};

export const getJournalInsights = async (entry: JournalEntry): Promise<string> => {
  try {
    const ratingContext = entry.rating ? `scored as ${entry.rating}/10` : "unrated";
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `I wrote a journal entry with title "${entry.title}" of type "${entry.entryType}" which is ${ratingContext}. Content: "${entry.content}". 
      Act as a wise, empathetic life coach. Give me a 1-sentence reflection or question to think about based on this entry.`,
      config: {
        temperature: 0.8,
      }
    });
    return response.text || "Every reflection is a step toward growth.";
  } catch (error) {
    return "Reflecting on your thoughts is the first step to clarity.";
  }
};
