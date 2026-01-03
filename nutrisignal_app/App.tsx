import React, { useState } from 'react';
import { View, Button, Image, Text, StyleSheet, Platform, ScrollView } from 'react-native';
import axios from 'axios';
import { launchCamera, launchImageLibrary } from 'react-native-image-picker';

export default function App() {
  const [photo, setPhoto] = useState<any>(null);
  const [result, setResult] = useState<any>(null);

  // --- Take photo using device camera
  const takePhoto = async () => {
    const res = await launchCamera({ mediaType: 'photo', quality: 0.8 });
    if (res.assets && res.assets[0]) {
      setPhoto(res.assets[0]);
      setResult(null);
    }
  };

  // --- Pick photo from library (works on simulator)
  const chooseFromLibrary = async () => {
    const res = await launchImageLibrary({ mediaType: 'photo', quality: 0.8 });
    if (res.assets && res.assets[0]) {
      setPhoto(res.assets[0]);
      setResult(null);
    }
  };

  // --- Send image to backend
  const classifyPhoto = async () => {
    if (!photo) return;

    const formData = new FormData();
    formData.append('file', {
      uri: photo.uri,
      name: 'photo.jpg',
      type: 'image/jpeg',
    });

    try {
      const response = await axios.post(
        'http://127.0.0.1:8000/classify',
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      );
      setResult(response.data);
    } catch (err) {
      console.error(err);
      setResult({ error: 'Could not connect to backend.' });
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>NutriSignal</Text>
      <View style={styles.buttonContainer}>
        <Button title="📸 Take Photo" onPress={takePhoto} />
        <View style={{ height: 10 }} />
        <Button title="🖼️ Choose from Gallery" onPress={chooseFromLibrary} />
      </View>

      {photo && <Image source={{ uri: photo.uri }} style={styles.image} />}
      
      <View style={{ marginVertical: 20 }}>
        <Button title="Classify" onPress={classifyPhoto} />
      </View>

      {result && (
        <View style={styles.resultContainer}>
          {result.error ? (
            <Text style={styles.errorText}>{result.error}</Text>
          ) : (
            <View style={styles.resultContent}>
              {/* Left: Big Circle */}
              <View style={styles.circleColumn}>
                <Text style={styles.bigCircle}>
                  {result.signal === "Green" ? "🟢" : result.signal === "Yellow" ? "🟡" : "🔴"}
                </Text>
              </View>

              {/* Right: Label and Score */}
              <View style={styles.infoColumn}>
                <Text style={styles.label}>{result.label}</Text>
                <Text style={styles.score}>{result.score.toFixed(2)} / 100</Text>
              </View>
            </View>
          )}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 26,
    fontWeight: '600',
    marginBottom: 20,
  },
  buttonContainer: {
    width: '80%',
  },
  image: {
    width: 300,
    height: 300,
    marginVertical: 20,
    borderRadius: 15,
    resizeMode: 'cover',
  },
  text: {
    marginTop: 10,
    fontSize: 18,
    textAlign: 'center',
  },
  resultContainer: {
    marginTop: 10,
    paddingHorizontal: 20,
    width: '100%',
  },
  resultContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#f5f5f5',
    borderRadius: 15,
    padding: 15,
  },
  circleColumn: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  bigCircle: {
    fontSize: 80,
  },
  infoColumn: {
    flex: 1,
    marginLeft: 12,
  },
  label: {
    fontSize: 22,
    fontWeight: '600',
    marginBottom: 8,
    textTransform: 'capitalize',
  },
  score: {
    fontSize: 18,
    fontWeight: '500',
    color: '#666',
  },
  errorText: {
    fontSize: 16,
    color: '#d32f2f',
    textAlign: 'center',
  },
});
